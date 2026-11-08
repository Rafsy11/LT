import React from 'react';
import type { TechnicianListItem } from '@repo/shared';
import { TechnicianCard } from './technician-card';
import { TechnicianCardSkeleton } from '@/components/ui/PageSkeleton';

interface TechnicianGridProps {
  technicians: TechnicianListItem[];
  processingUser: string | null;
  canManageTech: boolean;
  onSelectTech: (tech: TechnicianListItem) => void;
  onForceLogout: (usernameOrId: string) => void;
  onToggleAccount: (usernameOrId: string) => void;
  loading?: boolean;
}

const TECHNICIAN_SKELETON_COUNT = 6;

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
      >
        {Array.from({ length: TECHNICIAN_SKELETON_COUNT }).map((_, idx) => (
          <TechnicianCardSkeleton key={idx} />
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
