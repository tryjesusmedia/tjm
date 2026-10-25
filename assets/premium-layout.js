(() => {
  'use strict';
  const q = (s, root=document) => root.querySelector(s);
  function fold(node, title, extra='') {
    if (!node || node.parentElement?.classList.contains('premium-fold')) return;
    const details = document.createElement('details');
    details.className = 'premium-fold ' + extra;
    const summary = document.createElement('summary'); summary.textContent=title;
    node.before(details); details.append(summary,node); return details;
  }
  function revealHash(hash=location.hash) {
    if (!hash || hash==='#') return;
    let target; try {target=document.getElementById(decodeURIComponent(hash.slice(1)));} catch {return;}
    for(let node=target;node;node=node.parentElement) if(node.tagName==='DETAILS')node.open=true;
  }
  function setup() {
    document.body.classList.add('premium-system');
    // Footer branding and legal links remain visible; optional social links share one drawer.
    document.querySelectorAll('footer').forEach(footer=>{
      const social=q('.social-footer',footer)||q('.footer-social-links',footer)||q('.social-links',footer);
      if(social) fold(social,'Stay connected','premium-socials');
      footer.querySelectorAll('img').forEach(img=>{if(/logo|Try Jesus/i.test(img.src+' '+img.alt)){const a=img.closest('a');if(a)a.href='/';}});
    });
    const path=location.pathname.replace(/\/$/,'');
    if(path==='' || path==='/index.html') {
      document.body.classList.add('premium-home');
      fold(q('.hero-form-panel'),'Start my free journey','premium-signup');
      fold(q('#bible-decoded'),'Explore the optional Bible Decoded program');
      fold(q('#membership-perks'),'More included with your free membership');
    }
    if(path==='/welcome' || path==='/signupcomplete') {
      document.body.classList.add('premium-members');
      const main=q('main');
      const intro=document.createElement('section');intro.className='premium-member-start';
      intro.innerHTML='<h1>Where would you like to begin?</h1><p>Choose your next step. Come back whenever you’re ready.</p><div class="premium-destinations"><article class="premium-destination" id="chronological-reading-plan"><h2>The ChronBible Guide</h2><p>Follow the Bible story in the order it happened.</p><a class="button" href="/chronbible/?view=journey">Open ChronBible</a></article><article class="premium-destination" id="bible-decoded"><h2>Bible Decoded</h2><p>Learn practical ways to understand Scripture with Pastor Kal.</p><a class="button" href="/bibledecoded/">Explore Bible Decoded</a></article><article class="premium-destination"><h2>Bible Guides</h2><p>Explore questions about Jesus, faith, and Bible prophecy.</p><a class="button" href="#bible-guides">Choose a Bible guide</a></article></div>';
      q('#chronological-reading-plan',main)?.remove();q('#bible-decoded',main)?.remove();main.prepend(intro);
      [['#bible-guides','Choose a Bible guide'],['#watch','Watch Bible conversations'],['#live-discussion','Join the weekly Zoom discussion'],['#whatsapp-group','Connect with our WhatsApp family'],['#ask-pastor-kal','Ask Pastor Kal AI'],['#shop','Explore the store']].forEach(([s,t])=>fold(q(s,main),t));
      const resources=document.createElement('h2');resources.id='member-resources';resources.className='premium-resources-title';resources.textContent='More member resources';
      q('#watch',main)?.closest('.premium-fold')?.before(resources);
      const nav=q('#siteNav');if(nav)nav.innerHTML='<a href="/chronbible/?view=journey">The ChronBible Guide</a><a href="/bibledecoded/">Bible Decoded</a><a href="#bible-guides">Bible Guides</a><a href="#member-resources">More resources</a>';
    }
    if(document.body.classList.contains('chronbible')) {
      const book=q('.store-badge-book'),menu=q('#account-menu');
      if(book&&menu){menu.append(book);}
    }
    if(document.body.dataset.page==='sales') {
      fold(q('#curriculum'),'Explore the six lessons');
      fold(q('.faq'),'Frequently asked questions');
      fold(q('.store-section'),'Optional books, clothing and gifts');
      fold(q('.study-preview')?.closest('section'),'Your included Study Lab');
      const purchase=q('#enroll');
      if(purchase){purchase.querySelectorAll('a.button').forEach(a=>a.remove());fold(purchase,'What your purchase includes');}
      // Give the one purchase button enough context without a second sales panel.
      const note=q('.hero-copy .offer-note');if(note)note.textContent='One-time purchase. No monthly subscription.';
    }
    function simplifyLesson() {
      if(document.body.dataset.page!=='lesson')return;
      fold(q('.help-bar'),'Bible reference tools');
      fold(q('.coaching-invite'),'Optional help from Pastor Kal');
      const video=q('#video');
      const album=video?.nextElementSibling?.nextElementSibling;
      if(album?.classList.contains('actions'))fold(album,'More video options');
    }
    simplifyLesson();
    if(document.body.dataset.page==='lesson')new MutationObserver(simplifyLesson).observe(q('#app'),{childList:true,subtree:true});
    const guideTools=q('.guide-simple-tools'),extra=q('.guide-extra-tools');
    if(guideTools&&extra)guideTools.append(extra);
    revealHash();
    window.addEventListener('hashchange',()=>revealHash());
    document.addEventListener('click',e=>{const a=e.target.closest('a[href]');if(!a)return;const url=new URL(a.href,location.href);if(url.origin===location.origin&&url.pathname===location.pathname&&url.hash){revealHash(url.hash);}});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup,{once:true});else setup();
})();
