"use client";

import { useEffect, useState } from "react";

export function AnimatedCounter({ value }: { value: number }) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let start = 0;
    const duration = 900;
    const increment = Math.max(1, Math.ceil(value / 30));

    const timer = window.setInterval(() => {
      start += increment;
      if (start >= value) {
        setCount(value);
        window.clearInterval(timer);
      } else {
        setCount(start);
      }
    }, duration / 30);

    return () => window.clearInterval(timer);
  }, [value]);

  return <span>{count.toLocaleString()}</span>;
}
