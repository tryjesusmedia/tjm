(() => {
  const footer=document.querySelector('.footer-bottom');
  if(footer)new IntersectionObserver(entries=>{
    document.body.classList.toggle('credit-visible',entries[0].isIntersecting);
  }).observe(footer);
})();
