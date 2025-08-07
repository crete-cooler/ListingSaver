// content.js
function scrapeListing() {
  let address = document.querySelector('h1[data-test="address"]')?.innerText
             || document.querySelector('address')?.innerText
             || document.title.split('|')[0].trim();

  // rough bed/bath scraping for Zillow; tweak for each site
  let beds = parseFloat(
    document.querySelector('.ds-bed-bath-living-area span')?.innerText || '0'
  );
  let baths = parseFloat(
    document.querySelectorAll('.ds-bed-bath-living-area span')[1]?.innerText || '0'
  );

  // amenities list (Zillow & HotPads both use UL lists)
  let amenities = Array.from(
    document.querySelectorAll('.ds-home-fact-list li, .amenity-list li')
  ).map(li => li.innerText.trim())
   .filter(t => t);

  return { address, beds, baths, amenities };
}

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg.cmd === "SCRAPE") {
    reply(scrapeListing());
  }
});
