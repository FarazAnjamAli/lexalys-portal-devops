'use strict';
/* View helpers, available in every template as `fmt`. */

function money(n) {
  if (n === null || n === undefined) return '-';
  return '$' + Number(n).toLocaleString('en-US');
}

function date(d) {
  if (!d) return '-';
  const x = d instanceof Date ? d : new Date(d);
  return x.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

function dateTime(d) {
  if (!d) return '-';
  const x = d instanceof Date ? d : new Date(d);
  return x.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) + ' UTC';
}

const STATUS_LABELS = {
  new: 'New', contacted: 'Contacted', qualified: 'Qualified', won: 'Won', lost: 'Lost',
  pending: 'Pending', approved: 'Approved', in_progress: 'In progress', delivered: 'Delivered', cancelled: 'Cancelled',
};
function status(s) { return STATUS_LABELS[s] || s; }

function initials(name) {
  return String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('');
}

module.exports = { money, date, dateTime, status, initials };
