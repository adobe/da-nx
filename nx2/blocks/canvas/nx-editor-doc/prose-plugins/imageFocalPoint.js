import { Plugin } from 'da-y-wrapper';
import inlinesvg from './inlinesvg.js';
import { openFocalPointDialog } from './focalPointDialog.js';
import { isInTableCell } from './tableUtils.js';

const CROSSHAIRS_SVG = 'https://da.live/blocks/edit/img/Smock_Crosshairs_18_N.svg';

function hasFocalPointData(attrs) {
  return (attrs.dataFocalX && attrs.dataFocalX !== '')
    || (attrs.dataFocalY && attrs.dataFocalY !== '');
}

function updateImageAttributes(img, attrs) {
  img.src = attrs.src;
  ['alt', 'title', 'width', 'height'].forEach((attr) => {
    if (attrs[attr]) {
      img[attr] = attrs[attr];
    } else {
      img.removeAttribute(attr);
    }
  });

  if (attrs.dataFocalX && attrs.dataFocalY) {
    img.setAttribute('data-focal-x', attrs.dataFocalX);
    img.setAttribute('data-focal-y', attrs.dataFocalY);
  } else {
    img.removeAttribute('data-focal-x');
    img.removeAttribute('data-focal-y');
    if (img.title?.includes('data-focal:')) {
      img.removeAttribute('title');
    }
  }
}

class ImageWithFocalPointView {
  constructor(node, view, getPos) {
    this.node = node;
    this.view = view;
    this.getPos = getPos;

    this.dom = document.createElement('span');
    this.dom.className = 'focal-point-image-wrapper';

    this.img = document.createElement('img');
    updateImageAttributes(this.img, node.attrs);

    this.dom.appendChild(this.img);

    // Always enable the focal-point icon for images in table cells.
    // Previously we filtered against the per-block `focal-point: yes`
    // config from da.live's getLibraryList, but that fetch goes through
    // da.live's daFetch which auto-redirects to IMS on any 401 — racing
    // with imslib at editor mount / view-switch time and landing the
    // user in a sign-in loop. The icon itself stays at `opacity: 0`
    // until the wrapper is hovered (see nx-editor-doc.css), so always
    // attaching it has no visible cost for blocks that don't use focal
    // points.
    this.enableFocalPoint();
  }

  enableFocalPoint() {
    if (this.icon) return;

    this.icon = document.createElement('span');
    this.icon.className = hasFocalPointData(this.node.attrs)
      ? 'focal-point-icon focal-point-icon-active'
      : 'focal-point-icon';

    inlinesvg({ parent: this.icon, paths: [CROSSHAIRS_SVG] });

    this.handleIconClick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const pos = this.getPos();
      if (pos != null) {
        openFocalPointDialog(this.view, pos, this.node);
      }
    };
    this.icon.addEventListener('click', this.handleIconClick);

    this.dom.appendChild(this.icon);
  }

  update(node) {
    if (node.type.name !== 'image') return false;

    this.node = node;
    updateImageAttributes(this.img, node.attrs);

    if (this.icon) {
      this.icon.className = hasFocalPointData(node.attrs)
        ? 'focal-point-icon focal-point-icon-active'
        : 'focal-point-icon';
    }

    return true;
  }

  destroy() {
    if (this.icon) {
      this.icon.removeEventListener('click', this.handleIconClick);
    }
  }
}

export default function imageFocalPoint() {
  return new Plugin({
    props: {
      nodeViews: {
        image(node, view, getPos) {
          if (isInTableCell(view.state, getPos())) {
            return new ImageWithFocalPointView(node, view, getPos);
          }
          return null;
        },
      },
    },
  });
}
