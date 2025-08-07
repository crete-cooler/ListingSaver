# ListingSaver Chrome Extension

**ListingSaver** lets you scrape rental listings (Zillow, HotPads, Trulia) with one click, stash them in a dashboard, and track your application status—all from the comfort of your browser toolbar.

## Features
- Scrapes address, beds/baths, amenities and source URL  
- Stores all listings in `chrome.storage.local`  
- Dashboard to filter by status: new, contacted, applied, approved, denied  

## Installation
1. Clone or download this repo  
2. Go to `chrome://extensions/`  
3. Toggle **Developer mode** ON  
4. Click **Load unpacked** and select this folder  

## Usage
1. Navigate to a listing page on Zillow, HotPads or Trulia  
2. Click the ListingSaver icon in your toolbar  
3. Review scraped details and hit **Save to Dashboard**  
4. Open the dashboard (right-click the icon → **Open Dashboard**) to see and update all your saved listings  

## Development
- **`manifest.json`** – extension configuration  
- **`content.js`** – site-specific scraping logic  
- **`popup.html` / `popup.js`** – quick-save UI  
- **`dashboard.html` / `dashboard.js`** – central saved-listings dashboard  

Feel free to tweak the selectors in `content.js` for other sites or improve the UI in `popup.html` and `dashboard.html`.

## License
MIT @ M_Cancel
