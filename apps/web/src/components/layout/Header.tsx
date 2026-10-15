'use client';

import React, { useState } from 'react';
import { Icon } from '@/components/ui/Icon';

interface HeaderProps {
  pageTitle: string;
}

export function Header({ pageTitle }: HeaderProps) {
  const [notice, setNotice] = useState(false);

  return (
    <header>
      <div className="breadcrumb">
        Workspace <span>/</span> <b>{pageTitle}</b>
      </div>
      <div className="header-right">
        <span className="environment">
          <i className="green-dot" />
          Internal network
        </span>
        <button
          className="icon-button notification"
          onClick={() => setNotice(!notice)}
          aria-label="Notifikasi"
        >
          <Icon name="bell" size={18} />
          <i />
        </button>
        <span className="avatar small">AS</span>
      </div>
      {notice && (
        <div className="notification-pop">
          <b>Notifikasi terbaru</b>
          <p>Redaman kritis terdeteksi pada SIA 100245 (Budi Santoso: -26.4 dBm).</p>
          <small>Feed real-time · 2 menit lalu</small>
        </div>
      )}
    </header>
  );
}
