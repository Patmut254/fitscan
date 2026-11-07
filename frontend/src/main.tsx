import { createRoot } from 'react-dom/client';
import App from './App';
import '@fontsource-variable/archivo/standard.css';
import './index.css';

// StrictMode is intentionally not used: its double-invoked effects would reserve two participant IDs.
createRoot(document.getElementById('root')!).render(<App />);
