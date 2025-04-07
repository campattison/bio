# Cindy's Bread - Web Application

A web-based sourdough bread making assistant that helps bakers follow the Tartine Bakery method with environmental adjustments and baking journal functionality.

## Features

- **Step-by-step guides**: Detailed instructions for each stage of the bread-making process
- **Interactive timers**: Track time for each step with notifications when they complete
- **Environmental tracking**: Automatically adjusts recipes based on temperature and humidity
- **Baking Journal**: Log your results with photos and notes
- **Multiple bread sessions**: Track multiple loaves at different stages

## Getting Started

### Prerequisites

This is a pure HTML/CSS/JavaScript application with no dependencies. All you need is a modern web browser.

### Running the Application

1. Clone or download this repository
2. Open the `index.html` file in your web browser
   - Simply double-click the file, or
   - Open your browser and drag the file into it, or
   - Use the "File > Open" menu in your browser

That's it! The application will run directly in your browser without needing a server.

## Using the Application

### Home Screen

The home screen shows:
- Current environmental conditions (temperature and humidity)
- Baking recommendations based on those conditions
- Quick access to start a new bread session
- Recently active bread sessions

### Recipes

View the detailed Tartine Basic Country Sourdough recipe with:
- Ingredient list
- Step-by-step instructions
- Time estimates
- Start a new bread session from the recipe

### Active Sessions

Manage your ongoing bread sessions:
- Track current step and time remaining
- View adjusted recipe values for your environment
- Add notes to your session
- Navigate between steps with reminders

### Baking Journal

Record and review your bread-making results:
- Create detailed entries with photos
- Rate your results
- Track environmental conditions for each bake
- Review past successes and lessons learned

### Settings

Customize the application:
- Set manual temperature and humidity if desired
- Enable/disable browser notifications
- Enable/disable automatic recipe adjustments

## How It Works

### Environmental Adjustments

The app uses temperature and humidity data to automatically adjust:
- Water amounts (higher humidity = less water, lower humidity = more water)
- Fermentation times (higher temperature = shorter fermentation, lower temperature = longer fermentation)

### Browser Storage

In this demo version, data is stored only in browser memory and will be lost when the page is refreshed. A production version would use:
- localStorage for settings and small data
- IndexedDB for larger data like journal entries with photos

### Notifications

The app uses browser notifications to alert you when timers complete. You'll be prompted to allow notifications when you first use the app.

## Browser Compatibility

- Chrome 80+
- Firefox 72+
- Safari 13.1+
- Edge 80+

## Future Enhancements

- Persistent data storage
- More recipes
- Customizable recipes
- Social sharing features
- History tracking and success patterns
- Mobile app version

## License

This project is available as open source under the terms of the MIT License.

## Acknowledgements

- Recipe content based on the Tartine Bakery bread-making method
- Created for Cindy's bread-making adventures 