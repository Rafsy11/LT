'use client';

import React from 'react';
import {
  type TechnicianListItem,
  STANDARD_ERROR_MESSAGES,
  STANDARD_ACTION_LABELS,
  STANDARD_EMPTY_STATES,
} from '@repo/shared';
import { TechnicianCard } from './technician-card';
import { EmptyState } from '@/components/ui/EmptyState';
import { SafeErrorState } from '@/components/ui/SafeErrorState';
import { TechnicianCardSkeleton } from '@/components/ui/PageSkeleton';
import type { TechnicianModalIntent } from '../utils/technician-session';

export interface TechnicianGridProps {
  technicians: TechnicianListItem[];
  processingUser: string | null;
  canManageTech: boolean;
  onOpenModal: (tech: TechnicianListItem, intent?: TechnicianModalIntent) => void;
  loading?: boolean;
  loadError?: string | null;
  onRetry?: () => void;
  hasActiveFilters?: boolean;
  onResetFilters?: () => void;
}

const TECHNICIAN_SKELETON_COUNT = 6;

export function TechnicianGrid({
  technicians,
  processingUser,
  canManageTech,
  onOpenModal,
  loading,
  loadError,
  onRetry,
  hasActiveFilters = false,
  onResetFilters,
}: TechnicianGridProps) {
  if (loading) {
    return (
      <section className="technicians-cards-grid" aria-label="Memuat daftar teknisi" aria-busy="true">
        {Array.from({ length: TECHNICIAN_SKELETON_COUNT }).map((_, idx) => (
          <TechnicianCardSkeleton key={idx} />
        ))}
      </section>
    );
  }

  if (loadError && technicians.length === 0) {
    return (
      <SafeErrorState
        error={loadError}
        title="Gagal Memuat Data Teknisi"
        description={STANDARD_ERROR_MESSAGES.DATA_LOAD_FAILED}
        onRetry={onRetry}
        retryLabel={STANDARD_ACTION_LABELS.RELOAD_DATA}
        variant="panel"
      />
    );
  }

  if (technicians.length === 0) {
    return (
      <EmptyState
        icon={hasActiveFilters ? 'search' : 'wrench'}
        title={
          hasActiveFilters
            ? STANDARD_EMPTY_STATES.TECHNICIANS.FILTER_TITLE
            : STANDARD_EMPTY_STATES.TECHNICIANS.EMPTY_TITLE
        }
        description={
          hasActiveFilters
            ? STANDARD_EMPTY_STATES.TECHNICIANS.FILTER_DESC
            : STANDARD_EMPTY_STATES.TECHNICIANS.EMPTY_DESC
        }
        actionLabel={hasActiveFilters ? STANDARD_ACTION_LABELS.RESET_FILTER : undefined}
        actionIcon="refresh"
        onAction={hasActiveFilters ? onResetFilters : undefined}
      />
    );
  }

  return (
    <section className="technicians-cards-grid" aria-label="Daftar Teknisi Lapangan">
      {technicians.map((tech) => (
        <TechnicianCard
          key={tech.id || tech.username}
          tech={tech}
          isProcessing={processingUser === tech.username || processingUser === tech.id}
          canManageTech={canManageTech}
          onOpenModal={onOpenModal}
        />
      ))}
    </section>
  );
}
