// Human Review smoke page: proves that CSS, JavaScript, a JSON fetch and a
// touch interaction all work through the private remote deploy.
(function () {
  'use strict';

  function mark(id, ok, text) {
    var element = document.getElementById(id);
    element.setAttribute('data-state', ok ? 'ok' : 'fail');
    element.querySelector('span').textContent = text;
  }
  function show(id, text) {
    document.getElementById(id).textContent = text;
  }

  mark('check-js', true, 'running');
  var cssLoaded = getComputedStyle(document.documentElement).getPropertyValue('--smoke-css-loaded').trim() === '1';
  mark('check-css', cssLoaded, cssLoaded ? 'applied' : 'not applied');
  show('viewport', window.innerWidth + '×' + window.innerHeight + ' @' + window.devicePixelRatio + 'x · ' + navigator.userAgent);

  var dot = document.getElementById('dot');
  var button = document.getElementById('toggle');
  var taps = 0;
  button.disabled = false;
  button.addEventListener('click', function () {
    var playing = dot.classList.toggle('playing');
    button.textContent = playing ? 'Pause' : 'Play';
    taps += 1;
    show('taps', String(taps));
  });

  // The manifest is written by the staging step, so its presence proves the
  // page was published through the pipeline and names the exact source commit.
  fetch('review-manifest.json', { cache: 'no-store' })
    .then(function (response) {
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return response.json();
    })
    .then(function (manifest) {
      show('target', manifest.target);
      show('label', manifest.label);
      show('sha', manifest.source_sha);
      show('kind', manifest.review_kind + ' · AE reference ' + manifest.ae_reference);
      show('files', String(manifest.files.length));
      mark('check-manifest', true, 'loaded');
    })
    .catch(function (error) {
      show('target', 'manifest unavailable');
      mark('check-manifest', false, error.message);
    });
})();
