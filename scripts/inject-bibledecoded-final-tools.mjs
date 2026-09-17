import fs from 'node:fs';

const lessonPath='bibledecoded/lesson/index.html';
let lesson=fs.readFileSync(lessonPath,'utf8');
lesson=lesson.replace('</head>','<link rel="stylesheet" href="/bibledecoded/assets/final-tools.css?v=2"><script defer src="/bibledecoded/assets/final-tools-v2.js?v=2"></script></head>');
fs.writeFileSync(lessonPath,lesson);

const year=new Date().getFullYear();
const header=`<a class="skip" href="#main">Skip to content</a><header class="header"><div class="wrap"><a class="brand" href="/bibledecoded/"><img src="/assets/logo.png" alt="" width="42" height="42"><span>Bible Decoded<small>BY TRY JESUS MEDIA</small></span></a><nav aria-label="Bible Decoded"><a href="/bibledecoded/#curriculum">The course</a><a id="account-link" href="/bibledecoded/dashboard/">My dashboard</a><a class="header-signout" href="/bibledecoded/welcome/?signout=1">Sign out</a><div class="text-tools" aria-label="Reading size"><button id="smaller" aria-label="Make text smaller">−</button><button id="larger" aria-label="Make text larger">+</button></div></nav></div></header>`;
const footer=`<footer class="footer"><div class="wrap standard-footer"><span>© ${year} Try Jesus Media</span><a class="footer-members" href="/welcome/">Try Jesus Media Members</a><span><a href="/privacy">Privacy</a> · <a href="sms:+18162596486">Text</a> · <a href="mailto:info@tryjesusmedia.com">Email</a></span></div></footer>`;
const tools=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#43274a"><meta name="referrer" content="strict-origin-when-cross-origin"><meta name="robots" content="noindex,nofollow"><title>Bible Decoded Study Lab | Try Jesus Media</title><meta name="description" content="Reusable Bible Decoded study and discussion-building worksheets."><link rel="icon" href="/assets/favicon.png"><link rel="stylesheet" href="/bibledecoded/assets/style.css?v=2"><link rel="stylesheet" href="/bibledecoded/assets/final-tools.css?v=2"><script defer src="/bibledecoded/assets/final-tools-v2.js?v=2"></script></head><body data-page="final-tools">${header}<main id="main" class="wrap app-content"><div id="final-tools-app"><p class="loading" role="status">Opening your Bible Decoded Study Lab…</p></div></main>${footer}</body></html>`;
fs.mkdirSync('bibledecoded/final-tools',{recursive:true});
fs.writeFileSync('bibledecoded/final-tools/index.html',tools);
console.log('Injected Bible Decoded congratulations and final tools.');
