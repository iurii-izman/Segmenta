import React from 'react';
import ReactDOM from 'react-dom/client';
import './i18n/config';
import App from './App';
import { JobProvider } from './stores/jobStore';
import './index.css';
import './extra.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <JobProvider>
            <App />
        </JobProvider>
    </React.StrictMode>
);
