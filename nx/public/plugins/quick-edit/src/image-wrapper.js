import { Plugin } from 'https://da.live/deps/da-y-wrapper/dist/index.js';

export function createImageWrapperPlugin() {
  return new Plugin({
    props: {
      nodeViews: {
        image: (node, view, getPos) => {
          const picture = document.createElement('picture');
          const img = document.createElement('img');
          
          // Copy attributes from the node to the img element
          if (node.attrs.src) img.src = node.attrs.src;
          if (node.attrs.alt) img.alt = node.attrs.alt;
          if (node.attrs.title) img.title = node.attrs.title;
          
          // Copy any data attributes
          Object.keys(node.attrs).forEach(key => {
            if (key.startsWith('data-')) {
              img.setAttribute(key, node.attrs[key]);
            }
          });
          
          picture.appendChild(img);
          
          return {
            dom: picture,
            contentDOM: null,
            update: (updatedNode) => {
              if (updatedNode.type.name !== 'image') return false;
              
              // Update img attributes
              if (updatedNode.attrs.src) img.src = updatedNode.attrs.src;
              if (updatedNode.attrs.alt) img.alt = updatedNode.attrs.alt;
              if (updatedNode.attrs.title) img.title = updatedNode.attrs.title;
              
              return true;
            },
            destroy: () => {
              picture.remove();
            }
          };
        }
      }
    }
  });
}