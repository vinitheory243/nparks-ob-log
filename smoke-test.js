// Smoke test for the case-type registry: loads the real index.html in a fake
// browser and checks that switching case type rewires the form, the collected
// data and the generated report correctly — and that the bird flow still works.
//
// Not part of the deployed site. jsdom is deliberately NOT a dependency in
// package.json so it never reaches the Vercel build. To run it:
//
//     npm i --no-save jsdom
//     node smoke-test.js index.html
//     rm -rf node_modules
//
// Add assertions here whenever you add a new case type.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const HTML = fs.readFileSync(process.argv[2], 'utf8');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${extra ? ' — ' + extra : ''}`); }
};

const dom = new JSDOM(HTML, { runScripts: 'dangerously', pretendToBeVisual: true });
const { window } = dom;
const doc = window.document;
window.alert = (m) => { throw new Error('alert(): ' + m); };
const opened = [];
window.open = () => ({ document: { write: (h) => opened.push(h), close() {} } });

// jsdom fires DOMContentLoaded on a later tick; fire it now so the page's own
// init listener runs before we start asserting.
doc.dispatchEvent(new window.Event('DOMContentLoaded', { bubbles: true }));

const $ = (id) => doc.getElementById(id);
const setv = (id, v) => { const el = $(id); if (!el) throw new Error('no such field: ' + id); el.value = v; };

console.log('\n=== BIRD (default) ===');
ok('case type dropdown built', $('caseType').options.length >= 2);
ok('defaults to bird', $('caseType').value === 'bird');
ok('bird count field exists', !!$('day1Pigeons'));
ok('dog count field absent', !$('day1Leashed'));
ok('Type of Activation visible', $('activationTypeGroup').style.display !== 'none');
ok('no case-specific brief box', !$('briefCustom'));
ok('single notes box (not hourly)', !!$('day1Notes') && !$('day1Block0'));
ok('6 summary boxes rendered', doc.querySelectorAll('#summaryContainer textarea').length === 6);
ok('petOwners defaults to Nil', $('petOwners').value === 'Nil');
ok('foodSources has bird template', $('foodSources').value.includes('Birds were observed foraging'));

setv('caseId', 'NPARKS-202607-TEST');
setv('location', 'Blk 22A');
setv('day1Date', '2026-08-10');
setv('day1Start', '11:30'); setv('day1End', '14:30');
setv('day1Pigeons', '14'); setv('day1Mynas', '3'); setv('day1Crows', '2'); setv('day1Chickens', '5');
setv('day1Notes', 'saw birds at the grass patch');

let days = window.collectDays();
ok('collectDays returns 1 day', days.length === 1);
ok('counts read correctly', days[0].c.Pigeons === '14' && days[0].c.Chickens === '5',
   JSON.stringify(days[0].c));
ok('notes read correctly', days[0].notes === 'saw birds at the grass patch');
ok('bird brief has 4 points', window.buildBriefPoints().length === 4);

window.previewReport();
let html = opened.pop() || '';
ok('preview: bird brief present', html.includes('Pigeon surveillance'));
ok('preview: Type of Activation row present', html.includes('Type of Activation'));
ok('preview: long date format', html.includes('10 August 2026'));
ok('preview: bird sightings line', html.includes('about 14 pigeons, 3 mynas, 2 crows, 5 chickens'));
ok('preview: SUMMARY OF OBSERVATIONS title', html.includes('SUMMARY OF OBSERVATIONS'));
ok('preview: no Completed Surveillance line', !html.includes('Completed Surveillance'));
ok('preview: bird attachments wording', html.includes('Photos and screenshots of videos'));

console.log('\n=== SWITCH TO DOG ===');
$('caseType').value = 'dog';
window.onCaseTypeChange();

ok('dog count fields exist', !!$('day1Leashed') && !!$('day1Unleashed') && !!$('day1Advisories'));
ok('bird count fields gone', !$('day1Pigeons'));
ok('dog text fields exist', !!$('day1Others') && !!$('day1Remark'));
ok('Type of Activation hidden', $('activationTypeGroup').style.display === 'none');
ok('case-specific brief box appeared', !!$('briefCustom'));
ok('date carried over', $('day1Date').value === '2026-08-10');
ok('shift times reset to dog defaults', $('day1Start').value === '16:30' && $('day1End').value === '19:30',
   $('day1Start').value + '-' + $('day1End').value);
ok('summary boxes reset to dog defaults', $('foodSources').value === 'No food sources or evidence of feeding sighted.');
ok('all 6 dog boxes have Generate', doc.querySelectorAll('#summaryContainer .btn-ai').length === 6);

console.log('\n--- hourly blocks ---');
ok('3 hourly blocks for a 3h shift', !!$('day1Block0') && !!$('day1Block1') && !!$('day1Block2') && !$('day1Block3'));
const labels = [...doc.querySelectorAll('#day1NotesWrap .hour-block-label')].map(e => e.textContent);
ok('block labels correct', labels.join('|') === '1630–1730 hrs|1730–1830 hrs|1830–1930 hrs', labels.join('|'));

// a part-hour shift should still end at the real end time
setv('day1End', '19:00'); window.renderNotes(1);
const labels2 = [...doc.querySelectorAll('#day1NotesWrap .hour-block-label')].map(e => e.textContent);
ok('part-hour shift ends at real end time', labels2[labels2.length - 1] === '1830–1900 hrs', labels2.join('|'));
setv('day1End', '19:30'); window.renderNotes(1);

setv('day1Leashed', '4'); setv('day1Unleashed', '0'); setv('day1Advisories', '0');
setv('day1Others', '1 cat');
setv('day1Remark', 'The border collie specified in the activation brief was sighted and was leashed.');
setv('day1Block0', 'Arrived at Leedon Park and did my rounds.');
setv('day1Block1', 'continued across to Bin Tong. nothing.');
setv('day1Block2', 'both parks again. nothing. Ended surveillance at 1930 hrs.');

days = window.collectDays();
ok('dog counts read', days[0].c.Leashed === '4' && days[0].c.Advisories === '0');
ok('dog text read', days[0].t.Others === '1 cat');
ok('blocks collected', days[0].blocks.length === 3 && days[0].blocks[0].text.startsWith('Arrived'));
ok('notes assembled with time prefixes',
   days[0].notes.startsWith('1630–1730 hrs Arrived at Leedon Park') &&
   days[0].notes.includes('1830–1930 hrs both parks again'),
   days[0].notes.slice(0, 60));

console.log('\n--- dog brief points ---');
ok('brief drops empty custom point', window.buildBriefPoints().length === 6);
setv('briefCustom', 'Keep a lookout for a border collie unleashed along Bin Tong Park.');
const bp = window.buildBriefPoints();
ok('brief has 7 points with custom', bp.length === 7, String(bp.length));
ok('custom lands at position 5', bp[4].startsWith('Keep a lookout'), bp[4]);

window.previewReport();
html = opened.pop() || '';
ok('preview: dog brief title', html.includes('Monitoring of Unleashed Dog(s) and Noise'));
ok('preview: no bird brief', !html.includes('Pigeon surveillance'));
ok('preview: custom point numbered 5', html.includes('5) Keep a lookout'));
ok('preview: call centre point numbered 7', html.includes('7) If they insist'));
ok('preview: NO Type of Activation row', !html.includes('Type of Activation'));
// The real dog report abbreviates the month inside the tables but keeps the long
// form in the "Surveillance Dates" header line. Both should be present.
ok('preview: short date inside tables', html.includes('10 Aug 2026'));
ok('preview: header keeps long month', html.includes('10 August 2026'));
ok('preview: dog sightings line', html.includes('4 leashed dogs and 1 cat sighted'), '');
ok('preview: remark appended to sighting', html.includes('border collie specified in the activation brief'));
ok('preview: SURVEILLANCE OBSERVATIONS title', html.includes('>SURVEILLANCE OBSERVATIONS<'));
ok('preview: OBSERVATION DETAILS title', html.includes('>OBSERVATION DETAILS<'));
ok('preview: Completed Surveillance line', html.includes('Completed Surveillance.'));
ok('preview: dog attachments wording', html.includes('Pictures taken minimally at 15-minute intervals'));
ok('preview: hourly blocks in notes cell', html.includes('1630–1730 hrs Arrived at Leedon Park'));
ok('preview: pet-owner row is NOT hardcoded Nil',
   !/Behaviours of pet owners[\s\S]{0,400}?<td>Nil<\/td>/.test(html));

console.log('\n=== SWITCH BACK TO BIRD (no regression) ===');
$('caseType').value = 'bird';
window.onCaseTypeChange();
ok('bird fields restored', !!$('day1Pigeons') && !$('day1Leashed'));
ok('single notes box restored', !!$('day1Notes') && !$('day1Block0'));
ok('Type of Activation visible again', $('activationTypeGroup').style.display !== 'none');
ok('brief box removed', !$('briefCustom'));
ok('bird defaults restored', $('petOwners').value === 'Nil');
ok('bird brief back to 4 points', window.buildBriefPoints().length === 4);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
