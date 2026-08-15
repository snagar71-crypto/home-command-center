import { useState, useEffect, useMemo } from "react";
import {
  collection, addDoc, updateDoc, deleteDoc,
  doc, onSnapshot, query, orderBy, serverTimestamp,
} from "firebase/firestore";
import { db } from "./firebase.js";

const CALENDAR_EMAIL = "sanmeenal.nagar@gmail.com";
const EVENTS_COL = "events";

const PRIORITY_CONFIG = {
  high:   { label: "High",   color: "#E05C3A", bg: "#FEF0EC", dot: "🔴" },
  medium: { label: "Medium", color: "#D4911A", bg: "#FEF9EC", dot: "🟡" },
  low:    { label: "Low",    color: "#2E8B57", bg: "#EDF7F1", dot: "🟢" },
};

const CATEGORY_CONFIG = {
  school:  { label: "School",  icon: "📚", color: "#5B6EB5" },
  tennis:  { label: "Tennis",  icon: "🎾", color: "#2E8B57" },
  family:  { label: "Family",  icon: "🏠", color: "#D4911A" },
  health:  { label: "Health",  icon: "🩺", color: "#C0516A" },
  social:  { label: "Social",  icon: "🎉", color: "#7B5EA7" },
  other:   { label: "Other",   icon: "📌", color: "#607D8B" },
};

const KIDS = ["Meenal", "Nagar", "Both"];
const DAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

function getToday() {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate());
}
function toDateObj(str) {
  const [y,m,d] = str.split("-").map(Number);
  return new Date(y, m-1, d);
}
function toDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function getWeekStart(date) {
  const d = new Date(date); d.setDate(d.getDate() - d.getDay()); return d;
}
function addDays(date, n) {
  const d = new Date(date);
