import React from 'react';

export const OdometerDigit: React.FC<{ val: string }> = ({ val }) => {
  const num = parseInt(val, 10);
  const isNumber = !isNaN(num);

  if (!isNumber) {
    return <span className="odo-separator">{val}</span>;
  }

  return (
    <div className="odo-digit-container">
      <div 
        className="odo-digit-strip" 
        style={{ transform: `translateY(-${num * 10}%)` }}
      >
        <span>0</span>
        <span>1</span>
        <span>2</span>
        <span>3</span>
        <span>4</span>
        <span>5</span>
        <span>6</span>
        <span>7</span>
        <span>8</span>
        <span>9</span>
      </div>
    </div>
  );
};

export const OdometerClock: React.FC<{ date: Date }> = ({ date }) => {
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');

  return (
    <div className="odo-clock-container">
      <style>{`
        .odo-clock-container {
          display: inline-flex;
          align-items: center;
          font-family: monospace;
          line-height: 1;
        }
        .odo-digit-container {
          display: inline-block;
          height: 1.1em;
          line-height: 1.1em;
          overflow: hidden;
          position: relative;
        }
        .odo-digit-strip {
          display: flex;
          flex-direction: column;
          transition: transform 0.45s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        .odo-digit-strip span {
          height: 1.1em;
          display: inline-block;
        }
        .odo-separator {
          display: inline-block;
          height: 1.1em;
          line-height: 1.1em;
          margin: 0 1px;
        }
      `}</style>
      <span className="odo-hours-group" style={{ color: 'var(--player-accent, #e50914)', display: 'inline-flex' }}>
        <OdometerDigit val={hh[0]} />
        <OdometerDigit val={hh[1]} />
      </span>
      <span className="odo-separator" style={{ color: 'var(--text-secondary, rgba(255, 255, 255, 0.6))' }}>:</span>
      <span className="odo-minutes-group" style={{ color: 'var(--text-primary, #ffffff)', display: 'inline-flex' }}>
        <OdometerDigit val={mm[0]} />
        <OdometerDigit val={mm[1]} />
      </span>
      <span className="odo-separator" style={{ color: 'var(--text-secondary, rgba(255, 255, 255, 0.6))' }}>:</span>
      <span className="odo-seconds-group" style={{ color: 'var(--text-primary, #ffffff)', display: 'inline-flex' }}>
        <OdometerDigit val={ss[0]} />
        <OdometerDigit val={ss[1]} />
      </span>
    </div>
  );
};
