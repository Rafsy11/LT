'use client';

import React from 'react';
import App from '../../../../mobile/App';

export default function MobileFieldAppPage() {
  return (
    <main className="mobile-shell-root">
      <style>{`
        .mobile-shell-root {
          min-height: 100vh;
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #F1F5F9;
          padding: 20px 16px;
          box-sizing: border-box;
          overflow-x: clip;
        }

        .mobile-shell-viewport {
          width: 100%;
          max-width: 440px;
          min-height: min(880px, calc(100vh - 40px));
          display: flex;
          flex-direction: column;
          background: #FFFFFF;
          border-radius: 16px;
          border: 1px solid #CBD5E1;
          box-shadow: 0 20px 40px -15px rgba(15, 23, 42, 0.12), 0 1px 3px rgba(15, 23, 42, 0.06);
          overflow-y: auto;
          overflow-x: clip;
          position: relative;
          -webkit-overflow-scrolling: touch;
        }

        .mobile-shell-viewport::-webkit-scrollbar {
          width: 4px;
        }

        .mobile-shell-viewport::-webkit-scrollbar-thumb {
          background: #CBD5E1;
          border-radius: 4px;
        }

        @media (max-width: 768px) {
          .mobile-shell-root {
            padding: 0 !important;
            background: #FFFFFF !important;
            display: block !important;
            min-height: 100vh !important;
            overflow-x: clip !important;
          }
          .mobile-shell-viewport {
            max-width: 100% !important;
            width: 100% !important;
            min-height: 100vh !important;
            border-radius: 0 !important;
            border: none !important;
            box-shadow: none !important;
            overflow-y: visible !important;
            overflow-x: clip !important;
          }
        }
      `}</style>

      <div className="mobile-shell-viewport">
        <App initialThemeMode="light" />
      </div>
    </main>
  );
}
