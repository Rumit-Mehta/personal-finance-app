import { useState } from "react";

const PROFILE_STORAGE_KEYS = {
  age: "pfa.profile.age",
  name: "pfa.profile.name",
};

export function useLocalProfileSession() {
  const [storageError, setStorageError] = useState("");
  const [session, setSession] = useState(() => {
    const profile = readStoredProfile();

    return {
      activeView: isCompleteProfile(profile) ? "dashboard" : "profile",
      profile,
    };
  });
  const profileComplete = isCompleteProfile(session.profile);

  function openDashboard() {
    setStorageError("");
    setSession((currentSession) => ({
      ...currentSession,
      activeView: profileComplete ? "dashboard" : "profile",
    }));
  }

  function openData() {
    setStorageError("");
    setSession((currentSession) => ({
      ...currentSession,
      activeView: profileComplete ? "data" : "profile",
    }));
  }

  function openProfile() {
    setStorageError("");
    setSession((currentSession) => ({
      ...currentSession,
      activeView: "profile",
    }));
  }

  function saveProfile(nextProfile) {
    try {
      persistProfile(nextProfile);
      setStorageError("");
      setSession({
        activeView: "dashboard",
        profile: nextProfile,
      });
    } catch {
      setStorageError(
        "Could not save this profile in the browser. Check browser storage settings and try again.",
      );
    }
  }

  return {
    activeView: session.activeView,
    openData,
    openDashboard,
    openProfile,
    profile: session.profile,
    profileComplete,
    saveProfile,
    storageError,
  };
}

function readStoredProfile() {
  if (typeof window === "undefined") {
    return emptyProfile();
  }

  try {
    return {
      age: window.localStorage.getItem(PROFILE_STORAGE_KEYS.age) ?? "",
      name: window.localStorage.getItem(PROFILE_STORAGE_KEYS.name) ?? "",
    };
  } catch {
    return emptyProfile();
  }
}

function persistProfile(profile) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(PROFILE_STORAGE_KEYS.name, profile.name);
  window.localStorage.setItem(PROFILE_STORAGE_KEYS.age, profile.age);
}

function isCompleteProfile(profile) {
  return Boolean(profile.name.trim()) && isValidAge(profile.age);
}

function isValidAge(age) {
  return /^[1-9]\d*$/.test(String(age).trim());
}

function emptyProfile() {
  return {
    age: "",
    name: "",
  };
}
