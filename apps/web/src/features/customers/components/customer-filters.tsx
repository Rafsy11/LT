import React from 'react';
import { Icon } from '@/components/ui/Icon';
import { SearchInput } from '@/components/ui/search-input';

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
              cluster.toLowerCase().trim() === cName.toLowerCase().trim());
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
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Cari nama, nomor SIA, ODP, atau alamat..."
            ariaLabel="Cari pelanggan"
            className="customer-search-box"
          />

          {/* Tombol Filter Wilayah Ringkas (Kecamatan, Kelurahan, Jalan) */}
          <div className="customer-wilayah-trigger-group">
            <button
              type="button"
              aria-expanded={isWilayahFilterOpen}
              onClick={() => setIsWilayahFilterOpen(!isWilayahFilterOpen)}
              title="Filter berdasarkan Kecamatan, Kelurahan, atau Jalan"
              className={`btn-wilayah-toggle ${isWilayahFilterOpen || activeWilayahCount > 0 ? 'is-active' : ''}`}
            >
              <Icon name="filter" size={13} />
              <span>Wilayah</span>
              {activeWilayahCount > 0 && (
                <span className="wilayah-badge-count">{activeWilayahCount}</span>
              )}
              <Icon
                name="chevron"
                size={12}
                style={{
                  transform: isWilayahFilterOpen ? 'rotate(180deg)' : 'none',
                }}
              />
            </button>
            {activeWilayahCount > 0 && (
              <button
                type="button"
                onClick={resetWilayahFilters}
                aria-label="Reset semua filter wilayah"
                title="Reset filter wilayah"
                className="customer-wilayah-quick-clear"
              >
                <Icon name="x" size={12} />
              </button>
            )}
          </div>
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

      {/* Baris Filter Wilayah Ringkas (1 baris inline, tanpa header & label berlebihan) */}
      {isWilayahFilterOpen && (
        <fieldset aria-label="Filter Wilayah Pelanggan" className="customer-wilayah-bar">
          <div className="customer-wilayah-grid">
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
              <option value="Semua kecamatan">Semua Kecamatan</option>
              {availableKecamatans.map((k) => (
                <option key={k} value={k}>
                  Kec. {k}
                </option>
              ))}
            </select>

            <select
              value={kelurahan}
              onChange={(e) => {
                setKelurahan(e.target.value);
                setJalan('Semua jalan');
              }}
              aria-label="Filter Kelurahan"
              className="customer-filter-select"
            >
              <option value="Semua kelurahan">Semua Kelurahan</option>
              {availableKelurahans.map((kl) => (
                <option key={kl} value={kl}>
                  Kel. {kl}
                </option>
              ))}
            </select>

            <select
              value={jalan}
              onChange={(e) => setJalan(e.target.value)}
              aria-label="Filter Jalan"
              className="customer-filter-select"
            >
              <option value="Semua jalan">Semua Jalan</option>
              {availableJalans.map((j) => (
                <option key={j} value={j}>
                  {j}
                </option>
              ))}
            </select>
          </div>

          {activeWilayahCount > 0 && (
            <button
              type="button"
              onClick={resetWilayahFilters}
              className="customer-wilayah-reset-btn"
            >
              <Icon name="x" size={12} />
              <span>Reset</span>
            </button>
          )}
        </fieldset>
      )}

      {/* Active Wilayah Filter Badges (tampil hanya saat panel ditutup agar tidak duplikat) */}
      {!isWilayahFilterOpen && activeWilayahCount > 0 && (
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
            className="ui-text-danger"
            style={{
              background: 'none',
              border: 'none',
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
