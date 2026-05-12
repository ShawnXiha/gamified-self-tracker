import React, { useEffect, useState } from 'react';

interface XPToastProps {
  xpAmount: number;
  isAddition: boolean;
  leveledUp?: boolean;
  onAnimationEnd: () => void;
}

export const XPToast: React.FC<XPToastProps> = ({ xpAmount, isAddition, leveledUp, onAnimationEnd }) => {
  const [opacity, setOpacity] = useState(1);
  const [translateY, setTranslateY] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      setOpacity(0);
      setTranslateY(isAddition ? -30 : 30);
    }, 50);

    const cleanup = setTimeout(() => {
      onAnimationEnd();
    }, leveledUp ? 2000 : 1000);

    return () => {
      clearTimeout(timer);
      clearTimeout(cleanup);
    };
  }, [onAnimationEnd, isAddition, leveledUp]);

  const color = leveledUp ? '#ff9800' : (isAddition ? '#4caf50' : '#f44336');

  return (
    <div
      data-testid="xp-toast"
      style={{
        position: 'absolute',
        top: '-10px',
        left: '20px',
        color,
        fontWeight: 'bold',
        pointerEvents: 'none',
        opacity,
        transform: `translateY(${translateY}px)`,
        transition: 'all 1s ease-out',
        zIndex: 10,
        textShadow: '1px 1px 2px rgba(0,0,0,0.2)',
      }}
    >
      {leveledUp ? `Level Up! +${xpAmount} XP` : `${isAddition ? '+' : '-'}${xpAmount} XP`}
    </div>
  );
};
