import { useCallback, useEffect, useRef, useState } from "react";

function assignRef(ref, value) {
  if (typeof ref === "function") ref(value);
  else if (ref) ref.current = value;
}

export default function ScrollArea({
  children,
  className = "",
  containerClassName = "",
  orientation = "vertical",
  viewportRef,
  onScroll,
  endShadowClassName = "",
  ...props
}) {
  const localRef = useRef(null);
  const [edges, setEdges] = useState({ start: false, end: false });

  const setViewport = useCallback((node) => {
    localRef.current = node;
    assignRef(viewportRef, node);
  }, [viewportRef]);

  const updateEdges = useCallback(() => {
    const node = localRef.current;
    if (!node) return;

    const horizontal = orientation === "horizontal";
    const position = horizontal ? node.scrollLeft : node.scrollTop;
    const viewportSize = horizontal ? node.clientWidth : node.clientHeight;
    const contentSize = horizontal ? node.scrollWidth : node.scrollHeight;
    const overflow = contentSize - viewportSize;

    setEdges({
      start: overflow > 2 && position > 2,
      end: overflow > 2 && position < overflow - 2,
    });
  }, [orientation]);

  useEffect(() => {
    const node = localRef.current;
    if (!node) return undefined;

    const frame = window.requestAnimationFrame(updateEdges);
    const resizeObserver = new ResizeObserver(updateEdges);
    const mutationObserver = new MutationObserver(updateEdges);
    resizeObserver.observe(node);
    mutationObserver.observe(node, { childList: true, subtree: true, characterData: true });

    return () => {
      window.cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
    };
  }, [children, updateEdges]);

  function handleScroll(event) {
    updateEdges();
    onScroll?.(event);
  }

  const overflowClass = orientation === "horizontal"
    ? "overflow-x-auto overflow-y-hidden"
    : "overflow-y-auto overflow-x-hidden";

  return (
    <div className={`relative min-h-0 min-w-0 ${containerClassName}`}>
      <div
        ref={setViewport}
        onScroll={handleScroll}
        className={`${overflowClass} ${className}`}
        {...props}
      >
        {children}
      </div>

      {edges.start && (
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute z-20 ${
            orientation === "horizontal"
              ? "inset-y-0 left-0 w-10 bg-gradient-to-r from-black/90 via-black/55 to-transparent"
              : "inset-x-0 top-0 h-9 bg-gradient-to-b from-black/90 via-black/55 to-transparent"
          }`}
        />
      )}
      {edges.end && (
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute z-20 ${endShadowClassName || (
            orientation === "horizontal"
              ? "inset-y-0 right-0 w-12 bg-gradient-to-l from-black/95 via-black/60 to-transparent"
              : "inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black via-black/85 to-transparent"
          )}`}
        />
      )}
    </div>
  );
}
