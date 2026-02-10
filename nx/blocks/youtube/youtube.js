import observe from '../../utils/intOb.js';

function decorate(el) {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('src', el.dataset.src);
  iframe.setAttribute('class', 'youtube');
  iframe.setAttribute('webkitallowfullscreen', '');
  iframe.setAttribute('mozallowfullscreen', '');
  iframe.setAttribute('allowfullscreen', '');
  iframe.setAttribute('allow', 'encrypted-media; accelerometer; gyroscope; picture-in-picture');
  iframe.setAttribute('scrolling', 'no');
  iframe.setAttribute('title', 'Youtube Video');
  el.replaceChildren(iframe);
}

export default function init(a) {
  const div = document.createElement('div');
  div.className = 'nx-video';
  const searchParams = new URLSearchParams(a.search);
  const id = searchParams.get('v') || a.pathname.split('/').pop();
  searchParams.delete('v');
  div.dataset.src = `https://www.youtube.com/embed/${id}?${searchParams.toString()}`;
  a.parentElement.replaceChild(div, a);
  observe(div, decorate);
}
