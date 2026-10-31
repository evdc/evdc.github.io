// Shows the slim nav once the masthead has scrolled out of view.
(function () {
  var bar = document.querySelector('.topbar');
  var masthead = document.querySelector('header');
  if (!bar || !masthead) return;

  function update() {
    bar.classList.toggle('is-visible', masthead.getBoundingClientRect().bottom < 0);
  }

  window.addEventListener('scroll', update, { passive: true });
  update();
})();
