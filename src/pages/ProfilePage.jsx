import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

export function ProfilePage({ onSave, profile, saveError }) {
  const [name, setName] = useState(profile.name);
  const [age, setAge] = useState(profile.age);
  const [validationError, setValidationError] = useState("");

  useEffect(() => {
    setName(profile.name);
    setAge(profile.age);
  }, [profile.age, profile.name]);

  function handleSubmit(event) {
    event.preventDefault();

    const nextName = name.trim();
    const nextAge = age.trim();

    if (!nextName) {
      setValidationError("Enter your name.");
      return;
    }

    if (!/^[1-9]\d*$/.test(nextAge)) {
      setValidationError("Enter your age as a positive whole number.");
      return;
    }

    setValidationError("");
    onSave({
      age: String(Number(nextAge)),
      name: nextName,
    });
  }

  return (
    <section className="mx-auto mt-10 max-w-xl">
      <div className="mb-6">
        <h1 className="text-3xl font-semibold tracking-normal">
          Local profile
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Save your name and age in this browser before opening the finance
          workspace.
        </p>
      </div>

      <form
        className="grid gap-4 rounded-lg border border-border bg-card p-6"
        onSubmit={handleSubmit}
      >
        <label className="grid gap-2">
          <span className="text-sm font-medium">Name</span>
          <input
            autoComplete="name"
            onChange={(event) => setName(event.target.value)}
            type="text"
            value={name}
          />
        </label>

        <label className="grid gap-2">
          <span className="text-sm font-medium">Age</span>
          <input
            inputMode="numeric"
            min="1"
            onChange={(event) => setAge(event.target.value)}
            step="1"
            type="number"
            value={age}
          />
        </label>

        {(validationError || saveError) && (
          <p className="status-error">{validationError || saveError}</p>
        )}

        <div>
          <Button type="submit">Save profile</Button>
        </div>
      </form>
    </section>
  );
}
