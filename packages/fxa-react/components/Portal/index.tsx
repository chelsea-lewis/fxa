import React, { memo, useEffect } from 'react';
import { createPortal } from 'react-dom';

type PortalProps = {
  id: string;
  children: React.ReactNode;
};

const TOP_LEVEL_NONMODAL_DIVS_SELECTOR = 'body > div:not(.portal)';

const setA11yOnAdjacentElementsAndBody = (els: NodeListOf<HTMLElement>) => {
  els.forEach((el) => {
    el.setAttribute('aria-hidden', 'true');
    el.classList.add('overflow-hidden');
    el.classList.add('pointer-events-none');
  });
};

const resetA11yOnAdjacentElementsAndBody = (els: NodeListOf<HTMLElement>) => {
  els.forEach((el) => {
    el.removeAttribute('aria-hidden');
    el.classList.remove('pointer-events-none');
  });
};

const Portal = ({
  id,
  children,
}: PortalProps): React.ReactPortal | null => {
  let el = document.getElementById(id);
  if (!el) {
    el = document.createElement('div');
    el.setAttribute('class', 'portal');
    el.setAttribute('id', id);
    document.body.appendChild(el);

    if (id === 'modal') {
      setA11yOnAdjacentElementsAndBody(
        document.querySelectorAll(TOP_LEVEL_NONMODAL_DIVS_SELECTOR)
      );
    }
  }

  setA11yOnAdjacentElementsAndBody(
    document.querySelectorAll(TOP_LEVEL_NONMODAL_DIVS_SELECTOR)
  );

  useEffect(() => {
    return () => {
      let el = document.getElementById(id);
      if (el && el.children.length === 1) {
        // Reset any non-portal properties here
        if (id !== 'modal') {
          el.remove();
        }
        // When unloaded, we do not remove the portal element in order to allow
        // a series of portal dependent components to be rendered.
        resetA11yOnAdjacentElementsAndBody(
          document.querySelectorAll(TOP_LEVEL_NONMODAL_DIVS_SELECTOR)
        );
      }
    };
  }, [id]);

  return createPortal(children, el);
};

export default memo(Portal);
