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
  // Single source of truth for sitewide footer markup. Regional pages retain
  // their lead-capture destinations for YouTube and merch.
  function unifiedFooter(footer) {
    if(footer.classList.contains('tjm-unified-footer'))return;
    const regional=/^\/(?:ny|nola|hi|mo)(?:\/|$)/.test(location.pathname);
    const signup=regional?'#guide-form':null;
    const social=[
      ['▶','YouTube',signup||'https://www.youtube.com/@TryJesusMedia'],
      ['f','Facebook','https://www.facebook.com/tryjesusmedia'],
      ['◎','Instagram','https://www.instagram.com/tryjesusmedia1/'],
      ['♪','TikTok','https://www.tiktok.com/@tryjesusmedia'],
      ['✉','Email','mailto:info@tryjesusmedia.com'],
      ['▣','Text','sms:+18162596486'],
      ['▦','Book a Call','https://calendly.com/kalroller/tryjesusmedia'],
      ['◆','Merch',signup||'https://try-jesus-new-york-shop.fourthwall.com/'],
      ['◉','WhatsApp','https://chat.whatsapp.com/Lqv7ZVbC3PPBmQNMjRoXaM']
    ];
    const legal=[
      ['Bible & Conflict of the Ages Reading Journey','/bibleandconflictoftheages/'],
      ['Get to Know Jesus Bible Studies','/get-to-know-jesus/'],
      ['Bible Prophecy Studies','/bible-prophecy/'],
      ['Privacy','/privacy'],
      ['Accessibility Help','mailto:info@tryjesusmedia.com?subject=Website%20accessibility%20help'],
      ['Powered by FaithCraft.agency','https://faithcraft.agency/'],
      ['Back to Top','#']
    ];
    const esc=value=>String(value).replace(/[&<>"']/g, ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
    const linkAttrs=href=>/^(?:https?:)?\/\//.test(href)?' target="_blank" rel="noopener noreferrer"':'';
    const socialLinks=social.map(([icon,label,href])=>
      '<a class="social-link" href="'+esc(href)+'" aria-label="'+esc(label)+'"'+linkAttrs(href)+
      '><span aria-hidden="true">'+esc(icon)+'</span><span>'+esc(label)+'</span></a>'
    ).join('');
    const legalLinks=legal.map(([label,href],i)=>
      '<a'+(i===0?' class="reading-journey-link"':'')+' href="'+esc(href)+'"'+linkAttrs(href)+'>'+esc(label)+'</a>'
    ).join('');
    // Preserve the guide-specific return action outside the standardized footer.
    const preservedBottom=footer.querySelector('.footer-bottom');
    const guideReturn=footer.querySelector('.guide-footer-return');
    if(guideReturn) {
      const wrap=document.createElement('div');
      wrap.className='tjm-guide-footer-return';
      footer.before(wrap);
      wrap.append(guideReturn);
    }
    footer.className='site-footer tjm-unified-footer';
    footer.innerHTML=
      '<div class="footer-brand">'+
        '<a href="/" aria-label="Try Jesus Media home"><img src="/assets/logo.png" width="76" height="76" alt="Try Jesus Media logo"></a>'+
        '<div><strong>TRY JESUS MEDIA</strong><span class="footer-community-tagline">Clear Bible answers. Practical help for your journey with Jesus.</span></div>'+
      '</div>'+
      '<details class="premium-fold premium-socials"><summary>Stay connected</summary>'+
        '<div class="social-footer"><div class="social-links">'+socialLinks+'</div></div>'+
      '</details>'+
      '<div class="footer-bottom">'+
        '<nav class="tjm-footer-links" aria-label="Footer links">'+legalLinks+'</nav>'+
        '<p class="tjm-copyright-last">© <span id="currentYear">'+new Date().getFullYear()+'</span> Try Jesus Media. All rights reserved.</p>'+
      '</div>';
    // Reuse the same footer-bottom node so an existing IntersectionObserver
    // (on the members page) continues tracking footer visibility.
    if(preservedBottom){
      const generated=footer.querySelector('.footer-bottom');
      if(generated){
        preservedBottom.className=generated.className;
        preservedBottom.innerHTML=generated.innerHTML;
        generated.replaceWith(preservedBottom);
      }
    }
  }
  function setup() {
    document.body.classList.add('premium-system');
    document.querySelectorAll('footer').forEach(unifiedFooter);
    // Footer branding and legal links remain visible; optional social links share one drawer.
    document.querySelectorAll('footer').forEach(footer=>{
      // Keep the Bible & Conflict journey alongside the footer's small utility links.
      const journey=q('.reading-journey-link',footer);
      const footerBottom=q('.footer-bottom',footer)||q('.footer-legal',footer);
      if(journey&&footerBottom&&!footerBottom.contains(journey))footerBottom.append(journey);
      // Existing store destinations are unchanged; only the visible footer label is shortened.
      footer.querySelectorAll('a.social-link').forEach(link=>{
        const spans=link.querySelectorAll('span');
        const label=(spans.length?spans[spans.length-1].textContent:link.textContent).trim();
        if(/^(?:Programs\s*(?:&|and)\s*Merch|Programs|Merchandise)$/i.test(label)
            && /fourthwall|#guide-form/.test(link.getAttribute('href')||'')){
          if(spans.length)spans[spans.length-1].textContent='Merch';
          else link.textContent='Merch';
          link.setAttribute('aria-label','Merch');
        }
      });
      const social=q('.social-footer',footer)||q('.footer-social-links',footer)||q('.social-links',footer);
      if(social) fold(social,'Stay connected','premium-socials');
      footer.querySelectorAll('img').forEach(img=>{if(/logo|Try Jesus/i.test(img.src+' '+img.alt)){const a=img.closest('a');if(a)a.href='/';}});
    });
    // Keep the copyright notice literally last, after every footer link.
    document.querySelectorAll('footer').forEach(footer=>{
      const bottom=q('.footer-bottom',footer);
      if(bottom){
        const copyright=Array.from(bottom.children).find(el=>el.tagName==='P' && /©|all rights reserved/i.test(el.textContent));
        if(copyright){copyright.classList.add('tjm-copyright-last');bottom.append(copyright);}
      } else {
        const host=q('.overview-width',footer)||q('.footer-inner',footer)||footer;
        const copyright=Array.from(host.children).find(el=>el.tagName==='P' && /©|all rights reserved/i.test(el.textContent));
        if(copyright){copyright.classList.add('tjm-copyright-last');host.append(copyright);}
      }
    });
    // Simple overview/legal footers keep their original links and wording, but receive the same left-aligned brand mark.
    document.querySelectorAll('body > footer.overview-footer, body > footer:not(.site-footer):not(.overview-footer)').forEach(footer=>{
      if(!footer.classList.contains('overview-footer'))footer.classList.add('tjm-compact-footer');
      const host=footer.querySelector(':scope > .container')||footer;
      if(!host.querySelector('.tjm-footer-logo, .footer-brand, .brand-footer')){
        const a=document.createElement('a');a.className='tjm-footer-logo';a.href='/';a.setAttribute('aria-label','Try Jesus Media home');
        const img=document.createElement('img');img.src='/welcome/assets/logo.webp';img.alt='Try Jesus Media';img.width=76;img.height=76;
        a.append(img);host.prepend(a);
      }
    });
    const path=location.pathname.replace(/\/$/,'');
    if(path==='' || path==='/index.html') {
      document.body.classList.add('premium-home');
      // The homepage Omnisend signup form stays visible (no accordion).
      const decodedFold = fold(q('#bible-decoded'),'Explore Bible Decoded');
      const perksFold = fold(q('#membership-perks'),'More included with your free membership');
      // Keep the two optional program drawers together, directly below the hero.
      if (decodedFold && perksFold) decodedFold.after(perksFold);
    }
    if(path==='/welcome' || path==='/signupcomplete') {
      document.body.classList.add('premium-members');
      const main=q('main');
      const intro=document.createElement('section');intro.className='premium-member-start';
      intro.innerHTML='<h1>Where would you like to begin?</h1><p>Choose your next step. Come back whenever you’re ready.</p><div class="premium-destinations"><article class="premium-destination" id="chronological-reading-plan"><h2>The ChronBible Guide</h2><p>Follow the Bible story in the order it happened.</p><a class="button" href="/chronbible/?view=journey">Open ChronBible</a></article><article class="premium-destination" id="bible-decoded"><h2>Bible Decoded</h2><p>Learn practical ways to understand Scripture with Pastor Kal.</p><a class="button" href="/bibledecoded/">Explore Bible Decoded</a></article><article class="premium-destination"><h2>Bible Guides</h2><p>Explore questions about Jesus, faith, and Bible prophecy.</p><a class="button" href="#bible-guides">Choose a Bible guide</a></article></div>';
      q('#chronological-reading-plan',main)?.remove();q('#bible-decoded',main)?.remove();main.prepend(intro);
      [['#bible-guides','Choose a Bible guide'],['#watch','Watch on YouTube'],['#live-discussion','Join the weekly Zoom discussion'],['#whatsapp-group','Connect with our WhatsApp family'],['#ask-pastor-kal','Ask Pastor Kal AI'],['#shop','Explore the store']].forEach(([s,t])=>fold(q(s,main),t));
      const resources=document.createElement('h2');resources.id='member-resources';resources.className='premium-resources-title';resources.textContent='More member resources';
      q('#watch',main)?.closest('.premium-fold')?.before(resources);
      const nav=q('#siteNav');if(nav)nav.innerHTML='<a href="/chronbible/?view=journey">The ChronBible Guide</a><a href="/bibledecoded/">Bible Decoded</a><a href="#bible-guides">Bible Guides</a><a href="#member-resources">More resources</a><details class="locations-dropdown"><summary>Locations</summary><div class="locations-submenu"><a href="/hi/">Hawaii</a><a href="/mo/">Missouri</a><a href="/nola/">New Orleans</a><a href="/ny/">New York</a></div></details>';
      const shopFold=q('#shop',main)?.closest('.premium-fold');
      if(shopFold && !q('.premium-pastor-link',main)){
        const pastorLink=document.createElement('a');
        pastorLink.className='premium-pastor-link';
        pastorLink.href='https://calendly.com/kalroller/tryjesusmedia';
        pastorLink.target='_blank';
        pastorLink.rel='noopener noreferrer';
        pastorLink.textContent='Talk to a Pastor';
        shopFold.after(pastorLink);
      }
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
