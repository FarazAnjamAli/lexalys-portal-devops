/* Lexalys Portal: mobile menu and the live price preview on the order form.
   The server recalculates the price on submit; this is only a preview. */
(function () {
  'use strict';

  var header = document.querySelector('.site-header');
  var toggle = document.getElementById('menu-toggle');
  if (header && toggle) {
    toggle.addEventListener('click', function () {
      var open = header.classList.toggle('open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  }

  var form = document.getElementById('order-form');
  if (!form) return;
  var select = form.querySelector('#service_id');
  var care = form.querySelector('#care_plan');
  var out = {
    base: document.getElementById('q-base'),
    rush: document.getElementById('q-rush'),
    setup: document.getElementById('q-setup'),
    monthly: document.getElementById('q-monthly'),
    days: document.getElementById('q-days'),
  };
  var money = function (n) { return '$' + Math.round(n).toLocaleString('en-US'); };

  function update() {
    var opt = select.options[select.selectedIndex];
    var rush = form.querySelector('input[name="rush"]:checked');
    if (!opt || !opt.value) {
      Object.keys(out).forEach(function (k) { if (out[k]) out[k].textContent = '-'; });
      return;
    }
    var setup = Number(opt.getAttribute('data-setup'));
    var monthly = Number(opt.getAttribute('data-monthly') || 0);
    var days = Number(opt.getAttribute('data-days') || 0);
    var mult = rush ? Number(rush.getAttribute('data-mult')) : 1;
    var speed = rush ? Number(rush.getAttribute('data-speed')) : 1;
    care.disabled = !monthly;
    if (!monthly) care.checked = false;
    out.base.textContent = money(setup);
    out.rush.textContent = 'x' + mult.toFixed(2);
    out.setup.textContent = money(setup * mult);
    out.monthly.textContent = care.checked && monthly ? money(monthly) + ' / mo' : 'None';
    out.days.textContent = days ? Math.max(1, Math.ceil(days * speed)) + ' business days' : 'Scoped after audit';
  }

  form.addEventListener('change', update);
  update();
})();
