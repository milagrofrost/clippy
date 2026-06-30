import { useEffect, useState, useCallback, useRef } from "react";

import { ANIMATIONS, Animation } from "../clippy-animations";
import {
  EMPTY_ANIMATION,
  getRandomIdleAnimation,
} from "../clippy-animation-helpers";
import { useChat } from "../contexts/ChatContext";
import { log } from "../logging";
import { useDebugState } from "../contexts/DebugContext";

const WAIT_TIME = 6000;

const LEFT_RIGHT_ANIMATION_REMAP: Record<string, string> = {
  GestureLeft: "GestureRight",
  GestureRight: "GestureLeft",
  LookLeft: "LookRight",
  LookRight: "LookLeft",
  LookUpLeft: "LookUpRight",
  LookUpRight: "LookUpLeft",
  LookDownLeft: "LookDownRight",
  LookDownRight: "LookDownLeft",
};

export function Clippy() {
  const {
    animationRequest,
    status,
    setStatus,
    setIsChatWindowOpen,
    isChatWindowOpen,
  } = useChat();
  const { enableDragDebug } = useDebugState();
  const [animation, setAnimation] = useState<Animation>(EMPTY_ANIMATION);
  const animationRef = useRef<Animation>(EMPTY_ANIMATION);
  const statusRef = useRef(status);
  const resetTimeoutRef = useRef<number | undefined>(undefined);
  const idleTimeoutRef = useRef<number | undefined>(undefined);

  const setCurrentAnimation = useCallback((nextAnimation: Animation) => {
    animationRef.current = nextAnimation;
    setAnimation(nextAnimation);
  }, []);

  const clearAnimationTimers = useCallback(() => {
    if (resetTimeoutRef.current) {
      window.clearTimeout(resetTimeoutRef.current);
      resetTimeoutRef.current = undefined;
    }

    if (idleTimeoutRef.current) {
      window.clearTimeout(idleTimeoutRef.current);
      idleTimeoutRef.current = undefined;
    }
  }, []);

  const playRandomIdleAnimation = useCallback(() => {
    if (statusRef.current !== "idle") return;

    clearAnimationTimers();

    const randomIdleAnimation = getRandomIdleAnimation(animationRef.current);
    setCurrentAnimation(randomIdleAnimation);

    resetTimeoutRef.current = window.setTimeout(() => {
      setCurrentAnimation(ANIMATIONS.Default);
      resetTimeoutRef.current = undefined;

      idleTimeoutRef.current = window.setTimeout(() => {
        idleTimeoutRef.current = undefined;
        playRandomIdleAnimation();
      }, WAIT_TIME);
    }, randomIdleAnimation.length);
  }, [clearAnimationTimers, setCurrentAnimation]);

  const playAnimation = useCallback(
    (key: string) => {
      if (!key) {
        return;
      }

      const resolvedKey = LEFT_RIGHT_ANIMATION_REMAP[key] || key;
      const selectedAnimation = ANIMATIONS[resolvedKey];

      if (selectedAnimation) {
        log(`Playing animation`, { key, resolvedKey });

        clearAnimationTimers();
        setCurrentAnimation(selectedAnimation);

        resetTimeoutRef.current = window.setTimeout(() => {
          setCurrentAnimation(ANIMATIONS.Default);
          resetTimeoutRef.current = undefined;
        }, selectedAnimation.length + 200);
      } else {
        log(`Animation not found`, { key, resolvedKey });
      }
    },
    [clearAnimationTimers, setCurrentAnimation],
  );

  const toggleChat = useCallback(() => {
    setIsChatWindowOpen(!isChatWindowOpen);
  }, [isChatWindowOpen, setIsChatWindowOpen]);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    if (status === "welcome" && animationRef.current === EMPTY_ANIMATION) {
      clearAnimationTimers();
      setCurrentAnimation(ANIMATIONS.Show);

      resetTimeoutRef.current = window.setTimeout(() => {
        resetTimeoutRef.current = undefined;
        setStatus("idle");
      }, ANIMATIONS.Show.length + 200);
    } else if (status === "idle") {
      if (!resetTimeoutRef.current && !idleTimeoutRef.current) {
        playRandomIdleAnimation();
      }
    } else {
      clearAnimationTimers();
    }

    return () => {
      clearAnimationTimers();
    };
  }, [
    status,
    clearAnimationTimers,
    playRandomIdleAnimation,
    setCurrentAnimation,
    setStatus,
  ]);

  useEffect(() => {
    log(`New animation key`, { animationRequest });
    playAnimation(animationRequest.key);
  }, [animationRequest.id, playAnimation]);

  return (
    <div>
      <div
        className="app-drag"
        style={{
          position: "absolute",
          height: "93px",
          width: "124px",
          backgroundColor: enableDragDebug ? "blue" : "transparent",
          opacity: enableDragDebug ? 0.5 : 1,
          zIndex: 5,
        }}
      >
        <div
          className="app-no-drag"
          style={{
            position: "absolute",
            height: "80px",
            width: "45px",
            backgroundColor: enableDragDebug ? "red" : "transparent",
            zIndex: 10,
            right: "40px",
            top: "2px",
            cursor: "help",
          }}
          onClick={toggleChat}
        ></div>
      </div>
      <img
        key={animation.src}
        className="app-no-select"
        src={animation.src}
        draggable={false}
        alt="Clippy"
      />
    </div>
  );
}
