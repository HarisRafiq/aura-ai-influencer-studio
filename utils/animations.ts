// Animation Utilities

/**
 * Fade In Animation Hook
 * Usage: import { useFadeIn } from './animations';
 * const fadeInClass = useFadeIn();
 */
export const fadeInClass = 'animate-fade-in';
export const fadeInUpClass = 'animate-fade-in-up';
export const floatClass = 'animate-float';
export const animateInClass = 'animate-in';

/**
 * Stagger animations for lists
 * Usage: items.map((item, i) => <div style={getStaggerDelay(i)}>...</div>)
 */
export const getStaggerDelay = (index: number, delayMs = 100) => ({
  animationDelay: `${index * delayMs}ms`
});

/**
 * Transition classes
 */
export const transitionClasses = {
  all: 'transition-all duration-300',
  fast: 'transition-all duration-150',
  slow: 'transition-all duration-500',
  colors: 'transition-colors duration-200',
  transform: 'transition-transform duration-200'
};

/**
 * Hover scale effects
 */
export const hoverScaleClasses = {
  sm: 'hover:scale-105 active:scale-95',
  md: 'hover:scale-110 active:scale-95',
  lg: 'hover:scale-125 active:scale-95'
};
