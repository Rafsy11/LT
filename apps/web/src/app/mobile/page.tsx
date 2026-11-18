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
          background: #060B18;
          background-image: radial-gradient(ellipse at 50% 25%, rgba(14, 165, 233, 0.08) 0%, rgba(8, 14, 26, 0.8) 60%, #060B18 100%);
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
          background: #080E1A;
          border-radius: 20px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          box-shadow: 0 20px 50px -15px rgba(0, 0, 0, 0.8), 0 0 30px rgba(14, 165, 233, 0.06);
          overflow-y: auto;
          overflow-x: clip;
          position: relative;
          -webkit-overflow-scrolling: touch;
        }

        .mobile-shell-viewport::-webkit-scrollbar {
          width: 4px;
        }

        .mobile-shell-viewport::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.12);
          border-radius: 4px;
        }

        @media (max-width: 768px) {
          .mobile-shell-root {
            padding: 0 !important;
            background: #080E1A !important;
            background-image: none !important;
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
        <App initialThemeMode="dark" />
      </div>
    </main>
  );
}
