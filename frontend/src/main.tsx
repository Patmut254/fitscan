import { createRoot } from 'react-dom/client';
import App from './App';
import { wakeServer } from './lib/api';
import '@fontsource-variable/google-sans';
import './index.css';

// StrictMode is intentionally not used: its double-invoked effects would reserve two participant IDs.
wakeServer();
createRoot(document.getElementById('root')!).render(<App />);
