import React, { useEffect, useRef, useState } from "react";

export function CustomScrollbar({
    containerRef,
}: {
    containerRef: React.RefObject<HTMLElement | null>;
}) {
    const [top, setTop] = useState(0);
    const [height, setHeight] = useState(44);
    const [direction, setDirection] = useState<"up" | "down">("down");
    const [visible, setVisible] = useState(false);

    const lastScroll = useRef(0);

    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;

        const update = () => {
            const scrollTop = el.scrollTop;
            const scrollHeight = el.scrollHeight;
            const clientHeight = el.clientHeight;

            if (scrollHeight <= clientHeight + 10) {
                setVisible(false);
                return;
            }
            setVisible(true);

            if (scrollTop > lastScroll.current + 1) {
                setDirection("down");
            } else if (scrollTop < lastScroll.current - 1) {
                setDirection("up");
            }

            lastScroll.current = scrollTop;

            // Sleek, minimal floating thumb height (36px to 52px)
            const thumbHeight = Math.min(
                Math.max((clientHeight / scrollHeight) * clientHeight * 0.35, 36),
                52
            );

            const availableHeight = clientHeight - 24; // Padding offset
            const maxTop = availableHeight - thumbHeight;
            const maxScroll = scrollHeight - clientHeight;
            const thumbTop = maxScroll > 0 ? (scrollTop / maxScroll) * maxTop : 0;

            setTop(thumbTop);
            setHeight(thumbHeight);
        };

        update();

        el.addEventListener("scroll", update, { passive: true });
        window.addEventListener("resize", update);

        return () => {
            el.removeEventListener("scroll", update);
            window.removeEventListener("resize", update);
        };
    }, [containerRef]);

    if (!visible) return null;

    return (
        <div className="custom-scrollbar">
            <div
                className={`custom-scrollbar-thumb ${direction}`}
                style={{
                    top: `${top}px`,
                    height: `${height}px`,
                }}
            >
                <div className="thumb-dot" />
            </div>
        </div>
    );
}

export default CustomScrollbar;
