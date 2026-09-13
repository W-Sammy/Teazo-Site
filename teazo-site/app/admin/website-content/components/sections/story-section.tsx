"use client";

import { useState } from "react";
import { AccordionItem } from "../section-shell";
import { IconStory } from "../icons";
import { ErrorText } from "../field-controls";
import { isNonEmpty, withinMaxLength } from "../validators";

const MAX_STORY_LENGTH = 2000;

export default function StorySection({
  story,
  isOpen,
  onToggle,
  setRef,
  onStoryChange,
}: {
  story: string;
  isOpen: boolean;
  onToggle: () => void;
  setRef: (el: HTMLDivElement | null) => void;
  onStoryChange: (value: string) => void;
}) {
  const [touched, setTouched] = useState(false);

  let error: string | undefined;
  // gated on touched so an empty story doesn't show as an error before the user's first blur
  if (touched) {
    if (!isNonEmpty(story)) error = "Story can't be empty";
    else if (!withinMaxLength(story, MAX_STORY_LENGTH)) error = `Keep it under ${MAX_STORY_LENGTH} characters`;
  }

  return (
    <AccordionItem id="story" label="Our Story" icon={<IconStory />} isOpen={isOpen} onToggle={onToggle} setRef={setRef}>
      <p className="mb-2.5 text-xs text-gray-400">
        Shown on the homepage under the &quot;OUR STORY&quot; heading.
      </p>
      <div className="rounded-xl border border-[#ecdfd7] bg-[#fbf3ea] p-3">
        <textarea
          value={story}
          onChange={(e) => onStoryChange(e.target.value)}
          onBlur={() => setTouched(true)}
          rows={6}
          className={`w-full resize-y rounded-lg border bg-white px-3 py-2.5 text-sm leading-relaxed text-gray-700 focus:outline-none ${
            error ? "border-red-400 focus:border-red-400" : "border-[#ecdfd7] focus:border-[#dbb082]"
          }`}
        />
        <div className="mt-1 flex items-center justify-between gap-3">
          {error ? <ErrorText>{error}</ErrorText> : <span />}
          <span className={`shrink-0 text-[11px] ${story.length > MAX_STORY_LENGTH ? "text-red-600" : "text-gray-400"}`}>
            {story.length}/{MAX_STORY_LENGTH}
          </span>
        </div>
      </div>
    </AccordionItem>
  );
}
