import React from 'react';
import type { TechnicianListItem } from '@repo/shared';
import { TechnicianCard } from './technician-card';

interface TechnicianGridProps {
  technicians: TechnicianListItem[];
  processingUser: string | null;
  canManageTech: boolean;
  onSelectTech: (tech: TechnicianListItem) => void;
  onForceLogout: (usernameOrId: string) => void;
  onToggleAccount: (usernameOrId: string) => void;
}

export function TechnicianGrid({
  technicians,
  processingUser,
  canManageTech,
  onSelectTech,
  onForceLogout,
  onToggleAccount,
}: TechnicianGridProps) {
  if (technicians.length === 0) {
    return (
      <div
        style={{
          padding: '48px 24px',
          textAlign: 'center',
          color: '#94a3b8',
          fontSize: '13px',
          background: '#f8fafc',
          borderRadius: '8px',
          border: '1px dashed #cbd5e1',
        }}
      >
        Tidak ada teknisi yang sesuai dengan filter pencarian ini.
      </div>
    );
  }

  return (
    <section
      aria-label="Daftar Teknisi"
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))',
        gap: '14px',
      }}
    >
      {technicians.map((tech) => (
        <TechnicianCard
          key={tech.id || tech.username}
          tech={tech}
          isProcessing={processingUser === tech.username || processingUser === tech.id}
          canManageTech={canManageTech}
          onSelectTech={onSelectTech}
          onForceLogout={onForceLogout}
          onToggleAccount={onToggleAccount}
        />
      ))}
    </section>
  );
}
