# Media Player Web

A synchronized video watching web application built with Next.js and Socket.IO.

## Features

- 🎬 **Synchronized Video Playback** - Watch videos together in real-time
- 🏠 **Room Management** - Create and join rooms with unique codes
- 🔄 **Media Synchronization** - Automatic sync of play, pause, and seek events
- 🔊 **Volume Boost** - Adjustable volume enhancement
- 🌙 **Dark Mode** - Toggle between light and dark themes
- 📋 **Copy Room Code** - Click to copy room codes to clipboard
- 📱 **Responsive Design** - Works on desktop and mobile devices

## Tech Stack

- **Frontend**: Next.js 14, React, TypeScript, Tailwind CSS
- **Backend**: Socket.IO for real-time communication
- **Deployment**: Netlify-ready

## Getting Started

### Prerequisites

- Node.js 18+ 
- npm or yarn

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd media-player-web
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm run dev
```

4. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Usage

1. **Create a Room**: Click "Create" to generate a new room code
2. **Join a Room**: Enter a room code and click "Join"
3. **Load Media**: Click "Load File" to select a video file
4. **Sync Playback**: Use "Sync Media" to synchronize with other viewers
5. **Adjust Volume**: Use the volume boost slider for enhanced audio

## Deployment

### Netlify Deployment

This project is configured for easy deployment on Netlify:

1. Push your code to GitHub
2. Connect your GitHub repository to Netlify
3. Set build command: `npm run build`
4. Set publish directory: `out`
5. Deploy!

### Environment Variables

No environment variables are required for basic functionality.

## Project Structure

```
media-player-web/
├── src/
│   ├── app/
│   │   ├── globals.css
│   │   ├── layout.tsx
│   │   └── page.tsx
│   └── ...
├── public/
├── package.json
├── next.config.js
└── README.md
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

MIT License - see LICENSE file for details.

## Author

**Fahad Ahmed Patwary**
- GitHub: [@FahadPatwary](https://github.com/FahadPatwary)

---

Built with ❤️ for seamless media sharing
