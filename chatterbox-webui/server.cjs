const express = require('express');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = 5173;

// Enable CORS
app.use(cors());

// Serve static files from the dist directory
app.use(express.static(path.join(__dirname, 'dist')));

// Handle client-side routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// Listen on all interfaces
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running on http://0.0.0.0:${PORT}`);
  console.log(`Access locally at http://localhost:${PORT}`);
  console.log(`Access on network at http://fred:${PORT}`);
});