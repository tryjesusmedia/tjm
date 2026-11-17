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
    const spanish=/^\/es(?:\/|$)/.test(location.pathname) || document.documentElement.lang.toLowerCase().startsWith('es');
    const signup=regional?'#guide-form':null;
    const social=spanish?[
      ['▶','YouTube',signup||'https://www.youtube.com/@TryJesusMedia'],
      ['f','Facebook','https://www.facebook.com/tryjesusmedia'],
      ['◎','Instagram','https://www.instagram.com/tryjesusmedia1/'],
      ['♪','TikTok','https://www.tiktok.com/@tryjesusmedia'],
      ['✉','Correo','mailto:info@tryjesusmedia.com'],
      ['▣','Texto','sms:+18162596486'],
      ['▦','Reservar llamada','https://calendly.com/kalroller/tryjesusmedia'],
      ['◆','Tienda',signup||'https://try-jesus-new-york-shop.fourthwall.com/'],
      ['◉','WhatsApp','https://chat.whatsapp.com/Lqv7ZVbC3PPBmQNMjRoXaM']
    ]:[
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
    const legal=spanish?[
      ['Recorrido de lectura Biblia y El Conflicto de los Siglos','/bibleandconflictoftheages/'],
      ['Conoce a Jesús: guías bíblicas','/get-to-know-jesus/'],
      ['Guías de profecía bíblica','/bible-prophecy/'],
      ['Privacidad','/privacy'],
      ['Ayuda de accesibilidad','mailto:info@tryjesusmedia.com?subject=Website%20accessibility%20help'],
      ['Desarrollado por FaithCraft.agency','https://faithcraft.agency/'],
      ['Volver arriba','#']
    ]:[
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
        '<a href="'+(spanish?'/es/':'/')+'" aria-label="'+(spanish?'Inicio de Try Jesus Media':'Try Jesus Media home')+'"><img src="/assets/logo.png" width="76" height="76" alt="Try Jesus Media logo"></a>'+
        '<div><strong>TRY JESUS MEDIA</strong><span class="footer-community-tagline">'+(spanish?'Respuestas bíblicas claras. Ayuda práctica para tu recorrido con Jesús.':'Clear Bible answers. Practical help for your journey with Jesus.')+'</span></div>'+
      '</div>'+
      '<details class="premium-fold premium-socials"><summary>'+(spanish?'Mantente conectado':'Stay connected')+'</summary>'+
        '<div class="social-footer"><div class="social-links">'+socialLinks+'</div></div>'+
      '</details>'+
      '<div class="footer-bottom">'+
        '<nav class="tjm-footer-links" aria-label="'+(spanish?'Enlaces del pie de página':'Footer links')+'">'+legalLinks+'</nav>'+
        '<p class="tjm-copyright-last">© <span id="currentYear">'+new Date().getFullYear()+'</span> Try Jesus Media. '+(spanish?'Todos los derechos reservados.':'All rights reserved.')+'</p>'+
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

  const LANGUAGE_PAIRS=[
    ['/', '/es/'],
    ['/welcome/', '/es/welcome/'],
    ['/chronbible/', '/es/chronbible/'],
    ['/guidesonline/', '/es/guidesonline/'],
    ['/bibledecoded/', '/es/bibledecoded/'],
    ['/bibledecoded/welcome/', '/es/bibledecoded/welcome/'],
    ['/bibledecoded/dashboard/', '/es/bibledecoded/dashboard/'],
    ['/bibledecoded/lesson/', '/es/bibledecoded/lesson/'],
    ['/bibledecoded/complete/', '/es/bibledecoded/complete/'],
    ['/get-to-know-jesus/', '/es/get-to-know-jesus/'],
    ['/bible-prophecy/', '/es/bible-prophecy/'],
    ...Array.from({length:10},(_,i)=>[`/get-to-know-jesus/guide${i+1}/`,`/es/get-to-know-jesus/guide${i+1}/`]),
    ...Array.from({length:9},(_,i)=>[`/bible-prophecy/guide${i+1}/`,`/es/bible-prophecy/guide${i+1}/`])
  ];
  const normalizeLanguagePath = value => {
    let path=String(value||'/').replace(/\/index\.html$/,'').replace(/\/+$/,'');
    return path||'/';
  };
  function languagePairFor(pathname=location.pathname) {
    const current=normalizeLanguagePath(pathname);
    for(const [english,spanish] of LANGUAGE_PAIRS){
      if(current===normalizeLanguagePath(english)||current===normalizeLanguagePath(spanish)){
        return {english,spanish,current};
      }
    }
    return null;
  }
  function preferredLanguage() {
    try {
      const value=localStorage.getItem('tjm-language');
      return value==='es'||value==='en'?value:null;
    } catch { return null; }
  }
  function pairedLanguagePath(pathname,language) {
    const pair=languagePairFor(pathname);
    if(!pair)return null;
    return language==='es'?pair.spanish:pair.english;
  }
  function enforceLanguagePreference() {
    const language=preferredLanguage();
    if(!language)return false;
    const target=pairedLanguagePath(location.pathname,language);
    if(!target||normalizeLanguagePath(target)===normalizeLanguagePath(location.pathname))return false;
    location.replace(target+location.search+location.hash);
    return true;
  }
  function localizeEquivalentLinks(root=document) {
    const language=preferredLanguage();
    if(!language)return;
    root.querySelectorAll?.('a[href]').forEach(link=>{
      if(link.closest('.tjm-language-switch'))return;
      let url;
      try{url=new URL(link.getAttribute('href'),location.href);}catch{return;}
      if(url.origin!==location.origin)return;
      const target=pairedLanguagePath(url.pathname,language);
      if(!target||normalizeLanguagePath(target)===normalizeLanguagePath(url.pathname))return;
      url.pathname=target;
      link.href=url.pathname+url.search+url.hash;
    });
  }
  function keepLanguageSticky() {
    localizeEquivalentLinks(document);
    const observer=new MutationObserver(records=>{
      records.forEach(record=>record.addedNodes.forEach(node=>{
        if(node.nodeType!==1)return;
        if(node.matches?.('a[href]'))localizeEquivalentLinks(node.parentElement||document);
        else localizeEquivalentLinks(node);
      }));
    });
    observer.observe(document.body,{childList:true,subtree:true});
    document.addEventListener('click',event=>{
      const link=event.target.closest?.('a[href]');
      if(!link||link.closest('.tjm-language-switch'))return;
      const language=preferredLanguage();
      if(!language)return;
      let url;
      try{url=new URL(link.href,location.href);}catch{return;}
      if(url.origin!==location.origin)return;
      const target=pairedLanguagePath(url.pathname,language);
      if(!target||normalizeLanguagePath(target)===normalizeLanguagePath(url.pathname))return;
      event.preventDefault();
      url.pathname=target;
      location.assign(url.href);
    },true);
  }

  function setupLanguageSwitch() {
    const pair=languagePairFor(location.pathname);
    if(!pair||document.querySelector('.tjm-language-switch'))return;
    const {english:englishPath,spanish:spanishPath,current}=pair;
    const isSpanish=current===normalizeLanguagePath(spanishPath);
    const menuButton=document.querySelector(
      'header .tjm-menu-button, header .menu-toggle, header .bd-menu-toggle, header #profile-button, header #guide-menu-toggle'
    );
    const header=menuButton?.closest('header')||document.querySelector('header');
    if(!header||!menuButton)return;
    const host=menuButton.closest('.tjm-masthead-row,.header-inner,.wrap')||header;
    host.classList.add('tjm-has-language-switch');
    const controls=document.createElement('div');
    controls.className='tjm-language-menu-group';
    menuButton.before(controls);
    controls.append(menuButton);
    const suffix=location.search+location.hash;
    const makeLink=(href,longLabel,shortLabel,language,active)=>{
      const link=document.createElement('a');
      link.href=href+suffix;
      link.lang=language;
      link.hreflang=language;
      link.setAttribute('aria-label',language==='es'?'Ver esta página en español':'View this page in English');
      if(active)link.setAttribute('aria-current','page');
      link.innerHTML='<span class="tjm-lang-long">'+longLabel+'</span><span class="tjm-lang-short">'+shortLabel+'</span>';
      link.addEventListener('click',()=>{
        try{localStorage.setItem('tjm-language',language);}catch{}
      });
      return link;
    };
    const nav=document.createElement('nav');
    nav.className='tjm-language-switch';
    nav.setAttribute('aria-label',isSpanish?'Idioma':'Language');
    nav.append(
      makeLink(englishPath,'English','EN','en',!isSpanish),
      Object.assign(document.createElement('span'),{className:'tjm-language-divider',textContent:'|'}),
      makeLink(spanishPath,'Español','ES','es',isSpanish)
    );
    controls.prepend(nav);
  }


  // Guide content is translated in the /es/ lesson files. The shared reader
  // runtime still emits a few dynamic English labels when progress changes.
  function localizeSpanishGuideControls() {
    if (!/^\\/es\\/(?:get-to-know-jesus|bible-prophecy)\\/guide\\d+\\/?$/.test(location.pathname)) return;
    const translate=()=>{
      const count=document.getElementById('panelCount');
      if(count) {
        const value=count.textContent.trim();
        const step=value.match(/^STEP\\s+(\\d+)\\s+OF\\s+(\\d+)$/i);
        if(step)count.textContent='PASO '+step[1]+' DE '+step[2];
      }
      const toast=document.getElementById('toast');
      if(toast) {
        const value=toast.textContent.trim();
        const step=value.match(/^Step\\s+(\\d+)\\s+of\\s+(\\d+)$/i);
        const replacements={
          'Guide restarted':'Guía reiniciada',
          'Audio reading is not supported in this browser.':'La lectura en voz alta no está disponible en este navegador.'
        };
        const translated=step?'Paso '+step[1]+' de '+step[2]:(replacements[value]||null);
        if(translated && translated!==value)toast.textContent=translated;
      }
      const listen=document.querySelector('#listenButton .listen-label');
      if(listen) {
        const value=listen.textContent.trim();
        if(value==='Listen')listen.textContent='Escuchar';
        if(value==='Stop')listen.textContent='Detener';
      }
      document.querySelectorAll('#lessonDots [aria-label^="Open section"]').forEach(dot=>{
        dot.setAttribute('aria-label',dot.getAttribute('aria-label').replace('Open section','Abrir sección'));
      });
    };
    translate();
    const main=document.querySelector('main');
    if(main)new MutationObserver(translate).observe(main,{childList:true,subtree:true,characterData:true});
  }

  function setup() {
    if(enforceLanguagePreference())return;
    const path=location.pathname.replace(/\/$/,'');
    const spanish=document.documentElement.lang.toLowerCase().startsWith('es') || /^\/es(?:\/|$)/.test(path);
    document.body.classList.add('premium-system');
    setupLanguageSwitch();
    localizeSpanishGuideControls();
    keepLanguageSticky();
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
      if(social) fold(social,spanish?'Mantente conectado':'Stay connected','premium-socials');
      footer.querySelectorAll('img').forEach(img=>{if(/logo|Try Jesus/i.test(img.src+' '+img.alt)){const a=img.closest('a');if(a)a.href=spanish?'/es/':'/';}});
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
    if(path==='' || path==='/index.html') {
      document.body.classList.add('premium-home');
      // The homepage Omnisend signup form stays visible (no accordion).
      const decodedFold = fold(q('#bible-decoded'),'Explore Bible Decoded');
      const perksFold = fold(q('#membership-perks'),'More included with your free membership');
      // Keep the two optional program drawers together, directly below the hero.
      if (decodedFold && perksFold) decodedFold.after(perksFold);
    }
    if(path==='/welcome' || path==='/signupcomplete' || path==='/es/welcome') {
      document.body.classList.add('premium-members');
      const main=q('main');
      const intro=document.createElement('section');intro.className='premium-member-start';
      intro.innerHTML=spanish
        ? '<h1>¿Por dónde te gustaría comenzar?</h1><p>Elige tu próximo paso. Vuelve cuando estés listo.</p><div class="premium-destinations"><article class="premium-destination" id="chronological-reading-plan"><h2>La Guía ChronBible</h2><p>Sigue la historia de la Biblia en el orden en que sucedió.</p><a class="button" href="/es/chronbible/?view=journey">Abrir ChronBible</a></article><article class="premium-destination" id="bible-decoded"><h2>Bible Decoded</h2><p>Aprende maneras prácticas de comprender las Escrituras con Pastor Kal.</p><a class="button" href="/es/bibledecoded/">Explorar Bible Decoded</a></article><article class="premium-destination"><h2>Guías bíblicas</h2><p>Explora preguntas sobre Jesús, la fe y la profecía bíblica.</p><a class="button" href="#bible-guides">Elegir una guía bíblica</a></article></div>'
        : '<h1>Where would you like to begin?</h1><p>Choose your next step. Come back whenever you’re ready.</p><div class="premium-destinations"><article class="premium-destination" id="chronological-reading-plan"><h2>The ChronBible Guide</h2><p>Follow the Bible story in the order it happened.</p><a class="button" href="/chronbible/?view=journey">Open ChronBible</a></article><article class="premium-destination" id="bible-decoded"><h2>Bible Decoded</h2><p>Learn practical ways to understand Scripture with Pastor Kal.</p><a class="button" href="/bibledecoded/">Explore Bible Decoded</a></article><article class="premium-destination"><h2>Bible Guides</h2><p>Explore questions about Jesus, faith, and Bible prophecy.</p><a class="button" href="#bible-guides">Choose a Bible guide</a></article></div>';
      q('#chronological-reading-plan',main)?.remove();q('#bible-decoded',main)?.remove();main.prepend(intro);
      const folds=spanish
        ? [['#bible-guides','Elegir una guía bíblica'],['#watch','Ver en YouTube'],['#live-discussion','Unirse a la conversación semanal por Zoom'],['#whatsapp-group','Conectarse con nuestra familia de WhatsApp'],['#ask-pastor-kal','Preguntar a Pastor Kal IA'],['#shop','Explorar la tienda']]
        : [['#bible-guides','Choose a Bible guide'],['#watch','Watch on YouTube'],['#live-discussion','Join the weekly Zoom discussion'],['#whatsapp-group','Connect with our WhatsApp family'],['#ask-pastor-kal','Ask Pastor Kal AI'],['#shop','Explore the store']];
      folds.forEach(([s,t])=>fold(q(s,main),t));
      const resources=document.createElement('h2');resources.id='member-resources';resources.className='premium-resources-title';resources.textContent=spanish?'Más recursos para miembros':'More member resources';
      q('#watch',main)?.closest('.premium-fold')?.before(resources);
      const nav=q('#siteNav');if(nav)nav.innerHTML=spanish
        ? '<a href="/es/chronbible/?view=journey">La Guía ChronBible</a><a href="/es/bibledecoded/">Bible Decoded</a><a href="#bible-guides">Guías bíblicas</a><a href="/baptism/">Bautismo</a><a href="#member-resources">Más recursos</a><details class="locations-dropdown"><summary>Ubicaciones</summary><div class="locations-submenu"><a href="/hi/">Hawái</a><a href="/mo/">Misuri</a><a href="/nola/">Nueva Orleans</a><a href="/ny/">Nueva York</a></div></details>'
        : '<a href="/chronbible/?view=journey">The ChronBible Guide</a><a href="/bibledecoded/">Bible Decoded</a><a href="#bible-guides">Bible Guides</a><a href="/baptism/">Baptism</a><a href="#member-resources">More resources</a><details class="locations-dropdown"><summary>Locations</summary><div class="locations-submenu"><a href="/hi/">Hawaii</a><a href="/mo/">Missouri</a><a href="/nola/">New Orleans</a><a href="/ny/">New York</a></div></details>';
      const shopFold=q('#shop',main)?.closest('.premium-fold');
      if(shopFold && !q('.premium-pastor-form',main)){
        // Style the introduction and layout only; Omnisend owns its entire form.
        const pastorFold=document.createElement('details');
        pastorFold.className='premium-fold premium-pastor-form';
        const pastorToggle=document.createElement('summary');
        pastorToggle.textContent=spanish?'Habla con un pastor':'Talk to a Pastor';
        const pastorEmbed=document.createElement('div');
        pastorEmbed.id='omnisend-embedded-v2-6af73ec26e39df0b955367c0';
        const pastorContent=document.createElement('div');
        pastorContent.className='premium-pastor-content';
        const pastorIntro=document.createElement('div');
        pastorIntro.className='premium-pastor-intro';
        pastorIntro.innerHTML=spanish
          ? '<h2>No tienes que caminar solo.</h2><p>Ya sea que tengas una pregunta sobre la fe, quieras oración o simplemente necesites que alguien te escuche, estamos aquí para ti. Completa el formulario y alguien de nuestro equipo pastoral se comunicará contigo personalmente. Esperamos conocerte y acompañarte en tu camino.</p>'
          : '<h2>You don’t have to walk alone.</h2><p>Whether you have a question about faith, would like prayer, or simply need someone to listen, we’re here for you. Fill out the form, and someone from our pastoral team will reach out personally. We look forward to getting to know you and walking alongside you.</p>';
        pastorContent.append(pastorIntro,pastorEmbed);
        pastorFold.append(pastorToggle,pastorContent);
        let omniloaded=false;
        pastorFold.addEventListener('toggle',()=>{
          if(!pastorFold.open || omniloaded)return;
          omniloaded=true;
          // Load only when expanded: third-party layout can measure visible form dimensions.
          window.omnisend=window.omnisend||[];
          window.omnisend.push(['brandID','6995f37d2de8216a26d88410']);
          window.omnisend.push(['track','$pageViewed']);
          if(!document.querySelector('script[data-omnisend-loader],script[src*="omnisnippet1.com/inshop/launcher-v2.js"]')){
            const launcher=document.createElement('script');
            launcher.dataset.omnisendLoader='true';
            launcher.async=true;
            launcher.src='https://omnisnippet1.com/inshop/launcher-v2.js';
            document.head.append(launcher);
          }
        });
        shopFold.after(pastorFold);
      }
    }
    if(document.body.dataset.page==='sales') {
      fold(q('#curriculum'),spanish?'Explora las seis lecciones':'Explore the six lessons');
      fold(q('.faq'),spanish?'Preguntas frecuentes':'Frequently asked questions');
      fold(q('.store-section'),spanish?'Libros, ropa y regalos opcionales':'Optional books, clothing and gifts');
      fold(q('.study-preview')?.closest('section'),spanish?'Tu Laboratorio de Estudio incluido':'Your included Study Lab');
      const purchase=q('#enroll');
      if(purchase){purchase.querySelectorAll('a.button').forEach(a=>a.remove());fold(purchase,spanish?'Lo que incluye tu compra':'What your purchase includes');}
      // Give the one purchase button enough context without a second sales panel.
      const note=q('.hero-copy .offer-note');if(note)note.textContent=spanish?'Pago único. Sin suscripción mensual.':'One-time purchase. No monthly subscription.';
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
