import React from 'react';
import type { TechnicianListItem } from '@repo/shared';
import { TechnicianCard } from './technician-card';
import { Skeleton } from '@/components/ui/Skeleton';

interface TechnicianGridProps {
  technicians: TechnicianListItem[];
  processingUser: string | null;
  canManageTech: boolean;
  onSelectTech: (tech: TechnicianListItem) => void;
  onForceLogout: (usernameOrId: string) => void;
  onToggleAccount: (usernameOrId: string) => void;
  loading?: boolean;
}

export function TechnicianGrid({
  technicians,
  processingUser,
  canManageTech,
  onSelectTech,
  onForceLogout,
  onToggleAccount,
  loading,
}: TechnicianGridProps) {
  if (loading) {
    return (
      <section
        className="technicians-cards-grid"
        aria-label="Memuat Teknisi"
        aria-busy="true"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 320px), 1fr))',
          gap: '14px',
        }}
      >
        {Array.from({ length: 6 }).map((_, idx) => (
          <article key={idx} className="technician-card skeleton-card" style={{ padding: '16px', minHeight: '150px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <Skeleton width={42} height={42} borderRadius="50%" style={{ flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <Skeleton width="65%" height={16} style={{ marginBottom: '6px' }} />
                <Skeleton width="45%" height={12} />
              </div>
            </div>
            <Skeleton width="100%" height={36} borderRadius={6} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Skeleton width={80} height={14} />
              <Skeleton width={60} height={14} />
            </div>
          </article>
        ))}
      </section>
    );
  }

  if (technicians.length === 0) {
    return (
      <div className="technicians-empty-state">
        Tidak ada teknisi yang sesuai dengan filter pencarian ini.
      </div>
    );
  }

  return (
    <section
      className="technicians-cards-grid"
      aria-label="Daftar Teknisi"
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 320px), 1fr))',
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
