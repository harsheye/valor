import React, { useState, useMemo, useEffect, useRef } from 'react';
import { 
  ArrowUpDown, 
  ArrowUp, 
  ArrowDown, 
  Pause, 
  Play, 
  Eye, 
  EyeOff, 
  SlidersHorizontal, 
  ChevronRight, 
  X,
  Search,
  Download,
  Copy,
  Check
} from 'lucide-react';

export interface ColumnDef<T = any> {
  key: string;
  header: string;
  render?: (row: T) => React.ReactNode;
  sortable?: boolean;
  defaultVisible?: boolean;
  width?: string;
}

interface LiveTableProps<T = any> {
  columns: ColumnDef<T>[];
  data: T[];
  bufferedCount?: number;
  isPaused?: boolean;
  onTogglePause?: () => void;
  onApplyBuffer?: () => void;
  getRowId: (row: T) => string;
  onRowClick?: (row: T) => void;
  renderRowDetail?: (row: T) => React.ReactNode;
  searchPlaceholder?: string;
  emptyMessage?: string;
  maxDisplayRows?: number;
  onLoadMore?: () => void;
  hasMore?: boolean;
  exportFilename?: string;
}

export function LiveTable<T extends Record<string, any>>({
  columns,
  data,
  bufferedCount = 0,
  isPaused = false,
  onTogglePause,
  onApplyBuffer,
  getRowId,
  onRowClick,
  renderRowDetail,
  searchPlaceholder = 'Search rows…',
  emptyMessage = 'No records found',
  maxDisplayRows = 500,
  onLoadMore,
  hasMore = false,
  exportFilename = 'valor_table_export'
}: LiveTableProps<T>) {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>(() => {
    const map: Record<string, boolean> = {};
    columns.forEach(col => {
      map[col.key] = col.defaultVisible !== false;
    });
    return map;
  });
  const [showColPicker, setShowColPicker] = useState(false);
  const [selectedRow, setSelectedRow] = useState<T | null>(null);
  const [recentlyAddedIds, setRecentlyAddedIds] = useState<Set<string>>(new Set());
  const prevDataLengthRef = useRef<number>(data.length);

  // Animate new rows (highlight for 1.2s then fade)
  useEffect(() => {
    if (data.length > prevDataLengthRef.current) {
      const addedIds = new Set<string>();
      const newCount = data.length - prevDataLengthRef.current;
      for (let i = 0; i < Math.min(newCount, 15); i++) {
        if (data[i]) addedIds.add(getRowId(data[i]));
      }
      setRecentlyAddedIds(addedIds);
      const timer = setTimeout(() => {
        setRecentlyAddedIds(new Set());
      }, 1200);
      return () => clearTimeout(timer);
    }
    prevDataLengthRef.current = data.length;
  }, [data, getRowId]);

  // Column Sorting
  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDirection('asc');
    }
  };

  // Filtered & Sorted Data
  const processedData = useMemo(() => {
    let result = [...data];

    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      result = result.filter(row => {
        return Object.values(row).some(val => {
          if (val === null || val === undefined) return false;
          return String(val).toLowerCase().includes(q);
        });
      });
    }

    if (sortKey) {
      result.sort((a, b) => {
        const valA = a[sortKey];
        const valB = b[sortKey];
        if (valA === valB) return 0;
        if (valA === null || valA === undefined) return 1;
        if (valB === null || valB === undefined) return -1;
        const res = valA > valB ? 1 : -1;
        return sortDirection === 'asc' ? res : -res;
      });
    }

    return result.slice(0, maxDisplayRows);
  }, [data, searchTerm, sortKey, sortDirection, maxDisplayRows]);

  // CSV Export
  const handleExportCsv = () => {
    const activeCols = columns.filter(c => visibleColumns[c.key]);
    const headers = activeCols.map(c => `"${c.header.replace(/"/g, '""')}"`).join(',');
    const rows = processedData.map(row => {
      return activeCols.map(c => {
        const val = row[c.key];
        return `"${String(val ?? '').replace(/"/g, '""')}"`;
      }).join(',');
    });
    const csvContent = [headers, ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${exportFilename}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3, 12px)', width: '100%' }}>
      {/* Table Toolbar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 'var(--space-2, 8px)'
      }}>
        {/* Search Input */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          background: 'var(--surface-1, #151A21)',
          border: '1px solid var(--border, #262D39)',
          borderRadius: 'var(--radius-sm, 8px)',
          padding: '6px 12px',
          flex: '1 1 240px',
          maxWidth: '400px'
        }}>
          <Search size={15} color="var(--text-3, #8F99AA)" />
          <input
            type="text"
            placeholder={searchPlaceholder}
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            style={{
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: 'var(--text-1, #E4E8EE)',
              fontSize: '0.82rem',
              width: '100%'
            }}
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              style={{ background: 'transparent', border: 'none', color: 'var(--text-3, #8F99AA)', cursor: 'pointer' }}
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Action Controls & Buffer Pill */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {/* Buffered Events Pill */}
          {bufferedCount > 0 && (
            <button
              onClick={onApplyBuffer}
              title="Click to apply buffered live updates"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                background: 'var(--accent, #8CA9EE)',
                color: 'var(--on-accent, #0C1424)',
                border: 'none',
                padding: '5px 12px',
                borderRadius: '999px',
                fontSize: '0.78rem',
                fontWeight: 700,
                cursor: 'pointer',
                boxShadow: '0 0 12px rgba(140, 169, 238, 0.4)'
              }}
            >
              <span>⚡ {bufferedCount} new events — Apply now</span>
            </button>
          )}

          {/* Pause / Resume Live Stream Button */}
          {onTogglePause && (
            <button
              onClick={onTogglePause}
              aria-pressed={isPaused}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                background: isPaused ? 'rgba(227, 189, 122, 0.15)' : 'var(--surface-2, #1B212A)',
                color: isPaused ? 'var(--warning, #E3BD7A)' : 'var(--text-2, #A9B2C0)',
                border: `1px solid ${isPaused ? 'var(--warning, #E3BD7A)' : 'var(--border, #262D39)'}`,
                padding: '6px 12px',
                borderRadius: 'var(--radius-sm, 8px)',
                fontSize: '0.78rem',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              {isPaused ? <Play size={13} fill="currentColor" /> : <Pause size={13} fill="currentColor" />}
              <span>{isPaused ? 'Resume live updates' : 'Pause live updates'}</span>
            </button>
          )}

          {/* Column Visibility Picker Toggle */}
          <button
            onClick={() => setShowColPicker(prev => !prev)}
            title="Toggle column visibility"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              background: 'var(--surface-2, #1B212A)',
              color: 'var(--text-2, #A9B2C0)',
              border: '1px solid var(--border, #262D39)',
              padding: '6px 10px',
              borderRadius: 'var(--radius-sm, 8px)',
              fontSize: '0.78rem',
              cursor: 'pointer'
            }}
          >
            <SlidersHorizontal size={14} />
            <span>Columns</span>
          </button>

          {/* CSV Export */}
          <button
            onClick={handleExportCsv}
            title="Export filtered table to CSV"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              background: 'var(--surface-2, #1B212A)',
              color: 'var(--text-2, #A9B2C0)',
              border: '1px solid var(--border, #262D39)',
              padding: '6px 10px',
              borderRadius: 'var(--radius-sm, 8px)',
              fontSize: '0.78rem',
              cursor: 'pointer'
            }}
          >
            <Download size={14} />
            <span>Export</span>
          </button>
        </div>
      </div>

      {/* Column Selector Dropdown */}
      {showColPicker && (
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '8px',
          padding: '10px 14px',
          background: 'var(--surface-2, #1B212A)',
          border: '1px solid var(--border, #262D39)',
          borderRadius: 'var(--radius-sm, 8px)',
          fontSize: '0.76rem'
        }}>
          <span style={{ color: 'var(--text-3, #8F99AA)', fontWeight: 600, alignSelf: 'center', marginRight: '6px' }}>
            Toggle Columns:
          </span>
          {columns.map(col => {
            const isVis = visibleColumns[col.key] !== false;
            return (
              <button
                key={col.key}
                onClick={() => setVisibleColumns(prev => ({ ...prev, [col.key]: !isVis }))}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  background: isVis ? 'var(--accent-soft, rgba(140, 169, 238, 0.14))' : 'transparent',
                  color: isVis ? 'var(--accent, #8CA9EE)' : 'var(--text-3, #8F99AA)',
                  border: `1px solid ${isVis ? 'var(--accent, #8CA9EE)' : 'var(--border, #262D39)'}`,
                  padding: '3px 8px',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                {isVis ? <Eye size={12} /> : <EyeOff size={12} />}
                <span>{col.header}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Table Container with Sticky Header */}
      <div style={{
        position: 'relative',
        overflowX: 'auto',
        overflowY: 'auto',
        maxHeight: '640px',
        border: '1px solid var(--border, #262D39)',
        borderRadius: 'var(--radius-md, 12px)',
        background: 'var(--surface-1, #151A21)'
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.82rem' }}>
          <thead style={{
            position: 'sticky',
            top: 0,
            zIndex: 10,
            background: 'var(--surface-2, #1B212A)',
            boxShadow: '0 1px 0 var(--border, #262D39)'
          }}>
            <tr>
              {columns.filter(c => visibleColumns[c.key] !== false).map(col => (
                <th
                  key={col.key}
                  style={{
                    padding: '10px 14px',
                    color: 'var(--text-2, #A9B2C0)',
                    fontWeight: 600,
                    width: col.width || 'auto',
                    userSelect: 'none',
                    cursor: col.sortable !== false ? 'pointer' : 'default'
                  }}
                  onClick={() => col.sortable !== false && handleSort(col.key)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>{col.header}</span>
                    {col.sortable !== false && (
                      <span style={{ color: sortKey === col.key ? 'var(--accent, #8CA9EE)' : 'var(--text-3, #8F99AA)' }}>
                        {sortKey === col.key ? (
                          sortDirection === 'asc' ? <ArrowUp size={13} /> : <ArrowDown size={13} />
                        ) : (
                          <ArrowUpDown size={12} opacity={0.5} />
                        )}
                      </span>
                    )}
                  </div>
                </th>
              ))}
              {renderRowDetail && <th style={{ width: '40px', padding: '10px 14px' }}></th>}
            </tr>
          </thead>
          <tbody>
            {processedData.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.filter(c => visibleColumns[c.key] !== false).length + (renderRowDetail ? 1 : 0)}
                  style={{
                    padding: '36px 14px',
                    textAlign: 'center',
                    color: 'var(--text-3, #8F99AA)'
                  }}
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              processedData.map((row) => {
                const rowId = getRowId(row);
                const isRecentlyAdded = recentlyAddedIds.has(rowId);
                return (
                  <tr
                    key={rowId}
                    onClick={() => {
                      if (onRowClick) onRowClick(row);
                      if (renderRowDetail) setSelectedRow(row);
                    }}
                    style={{
                      borderBottom: '1px solid var(--border, #262D39)',
                      cursor: (onRowClick || renderRowDetail) ? 'pointer' : 'default',
                      transition: 'background-color 1.2s ease',
                      backgroundColor: isRecentlyAdded
                        ? 'var(--accent-soft, rgba(140, 169, 238, 0.22))'
                        : 'transparent'
                    }}
                  >
                    {columns.filter(c => visibleColumns[c.key] !== false).map(col => (
                      <td
                        key={col.key}
                        style={{
                          padding: '10px 14px',
                          color: 'var(--text-1, #E4E8EE)',
                          whiteSpace: 'nowrap',
                          maxWidth: '280px',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis'
                        }}
                      >
                        {col.render ? col.render(row) : String(row[col.key] ?? '')}
                      </td>
                    ))}
                    {renderRowDetail && (
                      <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                        <ChevronRight size={15} color="var(--text-3, #8F99AA)" />
                      </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Load More & Count Footer */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        fontSize: '0.78rem',
        color: 'var(--text-3, #8F99AA)',
        padding: '0 4px'
      }}>
        <span>Showing {processedData.length} of {data.length} records in memory</span>
        {hasMore && onLoadMore && (
          <button
            onClick={onLoadMore}
            style={{
              background: 'var(--surface-2, #1B212A)',
              color: 'var(--accent, #8CA9EE)',
              border: '1px solid var(--border, #262D39)',
              borderRadius: 'var(--radius-sm, 6px)',
              padding: '4px 12px',
              fontSize: '0.78rem',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            Load older from database
          </button>
        )}
      </div>

      {/* Row Detail Drawer */}
      {selectedRow && renderRowDetail && (
        <div style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: '520px',
          maxWidth: '90vw',
          backgroundColor: 'var(--surface-1, #151A21)',
          borderLeft: '1px solid var(--border, #262D39)',
          boxShadow: '-8px 0 32px rgba(0, 0, 0, 0.5)',
          zIndex: 999,
          display: 'flex',
          flexDirection: 'column',
          animation: 'slideInRight 0.25s ease'
        }}>
          {/* Drawer Header */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 20px',
            borderBottom: '1px solid var(--border, #262D39)',
            background: 'var(--surface-2, #1B212A)'
          }}>
            <h3 style={{ margin: 0, fontSize: '1rem', color: 'var(--text-1, #E4E8EE)', fontFamily: 'var(--font-display, Outfit)' }}>
              Record Details
            </h3>
            <button
              onClick={() => setSelectedRow(null)}
              style={{ background: 'transparent', border: 'none', color: 'var(--text-2, #A9B2C0)', cursor: 'pointer' }}
            >
              <X size={18} />
            </button>
          </div>

          {/* Drawer Content */}
          <div style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>
            {renderRowDetail(selectedRow)}
          </div>
        </div>
      )}
    </div>
  );
}
