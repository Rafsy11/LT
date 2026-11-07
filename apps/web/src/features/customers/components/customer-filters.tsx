import React from 'react';
import { Icon } from '@/components/ui/Icon';

export type CustomerStatusTab = 'all' | 'ACTIVE' | 'PENDING_INSTALL' | 'critical' | 'ISOLATED';

interface CustomerFiltersProps {
  cluster: string;
  setCluster: (cluster: string) => void;
  totalRawCustomers: number;
  availableClusters: string[];
  clusterCounts: Record<string, number>;
  search: string;
  setSearch: (search: string) => void;
  isWilayahFilterOpen: boolean;
  setIsWilayahFilterOpen: (open: boolean) => void;
  activeWilayahCount: number;
  statusTab: CustomerStatusTab;
  setStatusTab: (tab: CustomerStatusTab) => void;
  clusterScopedLength: number;
  activeCount: number;
  pendingCount: number;
  criticalCount: number;
  isolatedCount: number;
  resetWilayahFilters: () => void;
  kecamatan: string;
  setKecamatan: (k: string) => void;
  kelurahan: string;
  setKelurahan: (kl: string) => void;
  jalan: string;
  setJalan: (j: string) => void;
  availableKecamatans: string[];
  availableKelurahans: string[];
  availableJalans: string[];
}

export function CustomerFilters({
  cluster,
  setCluster,
  totalRawCustomers,
  availableClusters,
  clusterCounts,
  search,
  setSearch,
  isWilayahFilterOpen,
  setIsWilayahFilterOpen,
  activeWilayahCount,
  statusTab,
  setStatusTab,
  clusterScopedLength,
  activeCount,
  pendingCount,
  criticalCount,
  isolatedCount,
  resetWilayahFilters,
  kecamatan,
  setKecamatan,
  kelurahan,
  setKelurahan,
  jalan,
  setJalan,
  availableKecamatans,
  availableKelurahans,
  availableJalans,
}: CustomerFiltersProps) {
  return (
    <>
      {/* Cluster Tabs Navigation Bar */}
      <nav className="customer-cluster-tab-bar" role="tablist" aria-label="Filter Wilayah Cluster">
        <button
          type="button"
          role="tab"
          aria-selected={cluster === 'Semua cluster'}
          className={`customer-cluster-tab-btn ${cluster === 'Semua cluster' ? 'is-active' : ''}`}
          onClick={() => setCluster('Semua cluster')}
        >
          <span>Semua Wilayah</span>
          <span className="customer-tab-count-badge">{totalRawCustomers}</span>
        </button>
        {availableClusters.map((cName) => {
          const count = clusterCounts[cName] || 0;
          const isAct =
            cluster === cName ||
            (cluster !== 'Semua cluster' &&
              cluster.toLowerCase().replace('bandung ', '').trim() ===
                cName.toLowerCase().replace('bandung ', '').trim());
          return (
            <button
              key={cName}
              type="button"
              role="tab"
              aria-selected={isAct}
              className={`customer-cluster-tab-btn ${isAct ? 'is-active' : ''}`}
              onClick={() => setCluster(cName)}
            >
              <span>{cName}</span>
              <span className="customer-tab-count-badge">{count}</span>
            </button>
          );
        })}
      </nav>

      {/* Secondary Toolbar: Search + Filter Wilayah on Left, Segmented Status Filter Tabs on Right */}
      <div className="customer-sub-toolbar">
        {/* Left: Search Box + Integrated Filter Wilayah */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <search className="customer-search-box" role="search">
            <span
              style={{ color: '#94a3b8', display: 'flex', alignItems: 'center', flexShrink: 0 }}
            >
              <Icon name="search" size={14} />
            </span>
            <input
              aria-label="Cari pelanggan"
              placeholder="Cari nama, nomor SIA, ODP, atau alamat..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="customer-search-input"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                aria-label="Hapus pencarian"
                className="customer-search-clear"
              >
                <Icon name="x" size={13} />
              </button>
            )}
          </search>

          {/* Tombol Filter Wilayah (Kecamatan, Kelurahan, Jalan) */}
          <button
            type="button"
            aria-expanded={isWilayahFilterOpen}
            onClick={() => setIsWilayahFilterOpen(!isWilayahFilterOpen)}
            title="Buka filter spesifikasi wilayah (Kecamatan, Kelurahan, Jalan)"
            className={`btn-wilayah-toggle ${isWilayahFilterOpen || activeWilayahCount > 0 ? 'is-active' : ''}`}
          >
            <Icon name="filter" size={13} />
            <span>Filter Wilayah</span>
            {activeWilayahCount > 0 && (
              <span className="wilayah-badge-count">{activeWilayahCount}</span>
            )}
            <Icon
              name="chevron"
              size={12}
              style={{
                transform: isWilayahFilterOpen ? 'rotate(180deg)' : 'none',
                transition: 'transform 0.15s ease',
              }}
            />
          </button>
        </div>

        {/* Right: Segmented Status Filter Tabs */}
        <nav
          className="customer-status-segmented-tabs"
          role="tablist"
          aria-label="Filter Status Layanan"
        >
          <button
            type="button"
            role="tab"
            aria-selected={statusTab === 'all'}
            onClick={() => setStatusTab('all')}
            className={`customer-status-tab-btn ${statusTab === 'all' ? 'is-active' : ''}`}
          >
            <span>Semua</span>
            <span className="customer-status-tab-count">({clusterScopedLength})</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={statusTab === 'ACTIVE'}
            onClick={() => setStatusTab('ACTIVE')}
            className={`customer-status-tab-btn ${statusTab === 'ACTIVE' ? 'is-active' : ''}`}
          >
            <span className="status-dot-mini active" />
            <span>Aktif</span>
            <span className="customer-status-tab-count">({activeCount})</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={statusTab === 'PENDING_INSTALL'}
            onClick={() => setStatusTab('PENDING_INSTALL')}
            className={`customer-status-tab-btn ${statusTab === 'PENDING_INSTALL' ? 'is-active' : ''}`}
          >
            <span className="status-dot-mini pending" />
            <span>Pending PSB</span>
            <span className="customer-status-tab-count">({pendingCount})</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={statusTab === 'critical'}
            onClick={() => setStatusTab('critical')}
            className={`customer-status-tab-btn ${statusTab === 'critical' ? 'is-active' : ''}`}
          >
            <span className="status-dot-mini critical" />
            <span>Kritis</span>
            <span className="customer-status-tab-count">({criticalCount})</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={statusTab === 'ISOLATED'}
            onClick={() => setStatusTab('ISOLATED')}
            className={`customer-status-tab-btn ${statusTab === 'ISOLATED' ? 'is-active' : ''}`}
          >
            <span className="status-dot-mini isolated" />
            <span>Terisolir</span>
            <span className="customer-status-tab-count">({isolatedCount})</span>
          </button>
        </nav>
      </div>

      {/* Panel Filter Spesifikasi Wilayah (Kecamatan, Kelurahan, Jalan) */}
      {isWilayahFilterOpen && (
        <fieldset
          aria-label="Filter Spesifikasi Wilayah"
          className="customer-filter-subpanel"
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div
              className="customer-filter-subpanel-title"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '12px',
                fontWeight: 600,
              }}
            >
              <Icon name="pin" size={14} />
              <span>Filter Spesifikasi Wilayah Pelanggan</span>
            </div>
            {activeWilayahCount > 0 && (
              <button
                type="button"
                onClick={resetWilayahFilters}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#dc2626',
                  fontSize: '11.5px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '2px 6px',
                }}
              >
                <Icon name="x" size={11} />
                Reset Filter Wilayah
              </button>
            )}
          </div>

          <div
            className="customer-wilayah-grid"
            style={{
              alignItems: 'flex-end',
            }}
          >
            {/* Filter Kecamatan */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label
                style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  color: '#475569',
                  textTransform: 'uppercase',
                  letterSpacing: '0.4px',
                }}
              >
                Kecamatan
              </label>
              <select
                value={kecamatan}
                onChange={(e) => {
                  setKecamatan(e.target.value);
                  setKelurahan('Semua kelurahan');
                  setJalan('Semua jalan');
                }}
                aria-label="Filter Kecamatan"
                className="customer-filter-select"
              >
                <option>Semua kecamatan</option>
                {availableKecamatans.map((k) => (
                  <option key={k} value={k}>
                    Kec. {k}
                  </option>
                ))}
              </select>
            </div>

            {/* Filter Kelurahan */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label
                style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  color: '#475569',
                  textTransform: 'uppercase',
                  letterSpacing: '0.4px',
                }}
              >
                Kelurahan
              </label>
              <select
                value={kelurahan}
                onChange={(e) => {
                  setKelurahan(e.target.value);
                  setJalan('Semua jalan');
                }}
                aria-label="Filter Kelurahan"
                className="customer-filter-select"
              >
                <option>Semua kelurahan</option>
                {availableKelurahans.map((kl) => (
                  <option key={kl} value={kl}>
                    Kel. {kl}
                  </option>
                ))}
              </select>
            </div>

            {/* Filter Jalan */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label
                style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  color: '#475569',
                  textTransform: 'uppercase',
                  letterSpacing: '0.4px',
                }}
              >
                Jalan / Alamat Spesifik
              </label>
              <select
                value={jalan}
                onChange={(e) => setJalan(e.target.value)}
                aria-label="Filter Jalan"
                className="customer-filter-select"
              >
                <option>Semua jalan</option>
                {availableJalans.map((j) => (
                  <option key={j} value={j}>
                    {j}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </fieldset>
      )}

      {/* Active Wilayah Filter Badges */}
      {activeWilayahCount > 0 && (
        <aside
          aria-label="Filter Wilayah Terpilih"
          className="customer-active-filter-strip"
        >
          <span className="customer-active-filter-title">
            <Icon name="filter" size={12} />
            Filter Wilayah:
          </span>

          {kecamatan !== 'Semua kecamatan' && (
            <span className="customer-active-filter-badge">
              Kecamatan: <b>{kecamatan}</b>
              <button
                type="button"
                onClick={() => setKecamatan('Semua kecamatan')}
                aria-label="Hapus filter kecamatan"
                className="customer-filter-badge-remove"
              >
                <Icon name="x" size={11} />
              </button>
            </span>
          )}

          {kelurahan !== 'Semua kelurahan' && (
            <span className="customer-active-filter-badge">
              Kelurahan: <b>{kelurahan}</b>
              <button
                type="button"
                onClick={() => setKelurahan('Semua kelurahan')}
                aria-label="Hapus filter kelurahan"
                className="customer-filter-badge-remove"
              >
                <Icon name="x" size={11} />
              </button>
            </span>
          )}

          {jalan !== 'Semua jalan' && (
            <span className="customer-active-filter-badge">
              Jalan: <b>{jalan}</b>
              <button
                type="button"
                onClick={() => setJalan('Semua jalan')}
                aria-label="Hapus filter jalan"
                className="customer-filter-badge-remove"
              >
                <Icon name="x" size={11} />
              </button>
            </span>
          )}

          <button
            type="button"
            onClick={resetWilayahFilters}
            style={{
              background: 'none',
              border: 'none',
              color: '#dc2626',
              cursor: 'pointer',
              fontSize: '11px',
              fontWeight: 500,
              marginLeft: 'auto',
              textDecoration: 'underline',
            }}
          >
            Hapus semua filter wilayah
          </button>
        </aside>
      )}
    </>
  );
}
