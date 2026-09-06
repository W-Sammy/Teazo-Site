"use client";

import Image from "next/image";
import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type KeyboardEvent,
  type SubmitEvent,
} from "react";
import type { AdminGalleryImage } from "../../../types/gallery-image";

export type GalleryUploadValues = {
  name: string;
  tags: string[];
  file: File | null;
};

type GalleryUploadFormProps = {
  initialImage?: AdminGalleryImage | null;
  onCancel: () => void;
  onSave: (values: GalleryUploadValues) => void;
};

const acceptedImageTypes = ["image/jpeg", "image/png", "image/webp"];
const maxFileSize = 10 * 1024 * 1024;
const maxTags = 12;
const maxTagLength = 30;

function normalizeTag(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function fileNameToTitle(fileName: string) {
  const withoutExtension = fileName.replace(/\.[^/.]+$/, "");
  const words = withoutExtension.replace(/[_-]+/g, " ").trim();

  return words.replace(/\b\w/g, (character) => character.toUpperCase());
}

export default function GalleryUploadForm({
  initialImage = null,
  onCancel,
  onSave,
}: GalleryUploadFormProps) {
  const [name, setName] = useState(initialImage?.name ?? "");
  const [tags, setTags] = useState<string[]>(initialImage?.tags ?? []);
  const [tagInput, setTagInput] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(
    initialImage?.url ?? null,
  );
  const [isDragging, setIsDragging] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [tagError, setTagError] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const temporaryPreviewUrl = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (temporaryPreviewUrl.current) {
        URL.revokeObjectURL(temporaryPreviewUrl.current);
      }
    };
  }, []);

  function selectFile(file: File) {
    setImageError(null);

    if (!acceptedImageTypes.includes(file.type)) {
      setImageError("Choose a JPG, PNG, or WEBP image.");
      return;
    }

    if (file.size > maxFileSize) {
      setImageError("The selected image must be 10 MB or smaller.");
      return;
    }

    if (temporaryPreviewUrl.current) {
      URL.revokeObjectURL(temporaryPreviewUrl.current);
    }

    const nextPreviewUrl = URL.createObjectURL(file);
    temporaryPreviewUrl.current = nextPreviewUrl;
    setSelectedFile(file);
    setPreviewUrl(nextPreviewUrl);

    if (!name.trim()) {
      setName(fileNameToTitle(file.name));
      setNameError(null);
    }
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) selectFile(file);

    // Allows the same file to be selected again after it is removed or rejected.
    event.target.value = "";
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(false);

    const file = event.dataTransfer.files?.[0];
    if (file) selectFile(file);
  }

  function addTag(rawValue = tagInput) {
    const nextTag = normalizeTag(rawValue);

    if (!nextTag) return true;

    if (nextTag.length > maxTagLength) {
      setTagError(`Tags must be ${maxTagLength} characters or fewer.`);
      return false;
    }

    if (tags.length >= maxTags) {
      setTagError(`You can add up to ${maxTags} tags.`);
      return false;
    }

    const duplicate = tags.some(
      (tag: string) => tag.toLocaleLowerCase() === nextTag.toLocaleLowerCase(),
    );

    if (duplicate) {
      setTagError("That tag has already been added.");
      return false;
    }

    setTags((currentTags) => [...currentTags, nextTag]);
    setTagInput("");
    setTagError(null);
    return true;
  }

  function handleTagKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      addTag();
    }

    if (event.key === "Backspace" && !tagInput && tags.length > 0) {
      setTags((currentTags) => currentTags.slice(0, -1));
    }
  }

  function removeTag(tagToRemove: string) {
    setTags((currentTags) =>
      currentTags.filter((tag: string) => tag !== tagToRemove),
    );
    setTagError(null);
  }

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();

    const cleanName = name.trim();
    let submittedTags = tags;

    setNameError(null);
    setImageError(null);

    if (!cleanName) {
      setNameError("Enter a name for the image.");
      return;
    }

    if (!previewUrl) {
      setImageError("Select an image before saving.");
      return;
    }

    const pendingTag = normalizeTag(tagInput);
    if (pendingTag) {
      if (pendingTag.length > maxTagLength) {
        setTagError(`Tags must be ${maxTagLength} characters or fewer.`);
        return;
      }

      const duplicate = submittedTags.some(
        (tag: string) => tag.toLocaleLowerCase() === pendingTag.toLocaleLowerCase(),
      );

      if (!duplicate) {
        if (submittedTags.length >= maxTags) {
          setTagError(`You can add up to ${maxTags} tags.`);
          return;
        }
        submittedTags = [...submittedTags, pendingTag];
      }
    }

    onSave({
      name: cleanName,
      tags: submittedTags,
      file: selectedFile,
    });
  }

  const canSave = Boolean(name.trim() && previewUrl);

  return (
    <form
      onSubmit={handleSubmit}
      className="flex min-h-full flex-col pt-4"
      noValidate
    >
      <h2 className="mb-6 text-center text-xl font-semibold">
        {initialImage ? "Edit Image" : "Create New Image"}
      </h2>

      <div>
        <label htmlFor="gallery-image-name" className="mb-1 block text-sm text-gray-700">
          Name
        </label>
        <input
          id="gallery-image-name"
          type="text"
          value={name}
          onChange={(event: ChangeEvent<HTMLInputElement>) => {
            setName(event.target.value);
            setNameError(null);
          }}
          className={`w-full rounded border bg-white px-3 py-2 text-sm outline-none transition focus:ring-2 focus:ring-[#FFBDC7]/50 ${
            nameError ? "border-red-400" : "border-[#dbb082]"
          }`}
          aria-invalid={Boolean(nameError)}
          aria-describedby={nameError ? "gallery-name-error" : undefined}
        />
        {nameError && (
          <p id="gallery-name-error" className="mt-1 text-xs text-red-600">
            {nameError}
          </p>
        )}
      </div>

      <div className="mt-4">
        <label htmlFor="gallery-tag-input" className="mb-1 block text-sm text-gray-700">
          Add Tags
        </label>

        {tags.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5 rounded border border-[#dbb082] p-2">
            {tags.map((tag: string) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 rounded bg-[#fff0f2] px-2 py-1 text-xs text-gray-700"
              >
                {tag}
                <button
                  type="button"
                  onClick={() => removeTag(tag)}
                  className="cursor-pointer text-sm leading-none text-[#f08a9b] hover:text-red-600"
                  aria-label={`Remove ${tag} tag`}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}

        <div className="flex gap-2">
          <input
            id="gallery-tag-input"
            type="text"
            value={tagInput}
            onChange={(event: ChangeEvent<HTMLInputElement>) => {
              setTagInput(event.target.value);
              setTagError(null);
            }}
            onKeyDown={handleTagKeyDown}
            placeholder="Type a tag and press Enter"
            className={`min-w-0 flex-1 rounded border bg-white px-3 py-2 text-sm outline-none transition focus:ring-2 focus:ring-[#FFBDC7]/50 ${
              tagError ? "border-red-400" : "border-[#dbb082]"
            }`}
            aria-invalid={Boolean(tagError)}
            aria-describedby="gallery-tag-help"
          />
          <button
            type="button"
            onClick={() => addTag()}
            className="cursor-pointer rounded border border-[#dbb082] px-3 py-2 text-sm font-semibold text-[#9b6d43] hover:bg-[#fffaf6]"
          >
            Add
          </button>
        </div>
        <p id="gallery-tag-help" className={`mt-1 text-xs ${tagError ? "text-red-600" : "text-gray-500"}`}>
          {tagError ?? "Press Enter or comma to add each tag."}
        </p>
      </div>

      <div className="mt-6">
        {previewUrl && (
          <div className="mb-3">
            <div className="relative h-44 w-full overflow-hidden rounded-xl border border-[#dbb082] bg-[#f3ece6]">
              <Image
                src={previewUrl}
                alt={`${name || "Selected image"} preview`}
                fill
                unoptimized={previewUrl.startsWith("blob:")}
                className="object-cover"
                sizes="272px"
              />
            </div>
            <p className="mt-1 text-center text-xs text-gray-500">Preview</p>
          </div>
        )}

        <div
          onDragEnter={(event: DragEvent<HTMLDivElement>) => {
            event.preventDefault();
            setIsDragging(true);
          }}
          onDragOver={(event: DragEvent<HTMLDivElement>) => {
            event.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={(event: DragEvent<HTMLDivElement>) => {
            event.preventDefault();
            setIsDragging(false);
          }}
          onDrop={handleDrop}
          className={`flex min-h-36 flex-col items-center justify-center rounded-xl border-2 border-dashed p-4 text-center transition ${
            isDragging
              ? "border-[#f08a9b] bg-[#fff0f2]"
              : "border-[#dbb082] bg-[#fffaf6]"
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
            onChange={handleFileChange}
            className="hidden"
          />

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="cursor-pointer rounded-lg bg-[#FFBDC7] px-4 py-2 text-sm font-semibold text-white hover:bg-[#F59AA3]"
          >
            {initialImage || selectedFile
              ? "Select/Drag New Image Here"
              : "Select/Drag Image Here"}
          </button>
          <p className="mt-2 text-xs text-gray-500">
            JPG, PNG, or WEBP · 10 MB maximum
          </p>
        </div>

        {imageError && (
          <p className="mt-2 text-center text-xs text-red-600">{imageError}</p>
        )}
      </div>

      <div className="mt-auto flex items-center justify-between gap-3 pt-8">
        <button
          type="button"
          onClick={onCancel}
          className="cursor-pointer rounded-lg bg-gray-400 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-500"
        >
          Cancel
        </button>

        <button
          type="submit"
          disabled={!canSave}
          className="cursor-pointer rounded-lg bg-[#FFBDC7] px-4 py-2 text-sm font-semibold text-white hover:bg-[#F59AA3] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {initialImage ? "Save Changes" : "Save"}
        </button>
      </div>
    </form>
  );
}
