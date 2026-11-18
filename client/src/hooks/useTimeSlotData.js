import { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';

export const useTimeSlotData = () => {
  const [slotDate, setSlotDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
  const [slotMode, setSlotMode] = useState('day');
  const [slotWeek, setSlotWeek] = useState(() => {
    const d = new Date();
    const dayNum = d.getDay() || 7;
    const monday = new Date(d);
    monday.setDate(d.getDate() - dayNum + 1);
    const yearStart = new Date(monday.getFullYear(), 0, 1);
    const weekNo = Math.ceil((((monday - yearStart) / 86400000) + 1) / 7);
    return `${monday.getFullYear()}-W${String(weekNo).padStart(2, '0')}`;
  });
  const [slotMonth, setSlotMonth] = useState(`${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`);
  const [slotAttendanceData, setSlotAttendanceData] = useState([]);
  const [slotSummary, setSlotSummary] = useState([]);
  const [slotSummaryOut, setSlotSummaryOut] = useState([]);
  const [noCheckInCount, setNoCheckInCount] = useState(0);
  const [pairedTotals, setPairedTotals] = useState({ both: 0, noCheckout: 0 });
  const [slotAbsentStudents, setSlotAbsentStudents] = useState([]);
  const [expandedSlotDetails, setExpandedSlotDetails] = useState({ slot: null, type: null, items: [] });

  const getDatesForMode = (dateStr, mode) => {
    const base = new Date(dateStr);
    if (Number.isNaN(base.getTime())) return [dateStr];
    if (mode === 'week') {
      const day = base.getDay();
      const diffToMonday = (day + 6) % 7;
      const monday = new Date(base);
      monday.setDate(base.getDate() - diffToMonday);
      const dates = [];
      for (let i = 0; i < 7; i++) {
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);
        dates.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
      }
      return dates;
    }
    if (mode === 'month') {
      const y = base.getFullYear();
      const m = base.getMonth();
      const last = new Date(y, m + 1, 0).getDate();
      const dates = [];
      for (let d = 1; d <= last; d++) {
        dates.push(`${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
      }
      return dates;
    }
    return [dateStr];
  };

  const getMinutesFromTimestamp = (ts) => {
    const d = new Date(ts);
    return d.getHours() * 60 + d.getMinutes();
  };

  const loadSlotSummaryForDate = async (dateStr, mode = slotMode) => {
    try {
      const dateList = getDatesForMode(dateStr, mode);
      const responses = await Promise.all(
        dateList.map(d => axios.get('/api/attendance/reports/daily', { params: { date: d } }).catch(() => ({ data: {} })))
      );
      const list = responses.flatMap(r => r?.data?.report?.attendance || []);
      setSlotAttendanceData(list);

      const slotLabelsIn = ['Before 9:00', '9:00-9:29', '9:30-9:59', '10:00-10:59', 'After 11:00'];
      const countsIn = new Map(slotLabelsIn.map(l => [l, { name: l, checkIn: 0, checkOut: 0, noCheckout: 0, veryLate: 0 }]));
      const slotLabelsOut = ['Before 4:30 PM', '4:30-4:59 PM', '5:00-5:29 PM', '5:30-6:00 PM', 'After 6:00 PM'];
      const countsOut = new Map(slotLabelsOut.map(l => [l, { name: l, checkIn: 0, checkOut: 0 }]));
      const byStudent = new Map();
      
      for (const r of list) {
        const sid = r.student?._id || r.student;
        if (!sid) continue;
        if (!byStudent.has(sid)) byStudent.set(sid, { inTime: null, outTime: null });
        const entry = byStudent.get(sid);
        if (r.type === 'in') {
          if (!entry.inTime || new Date(r.timestamp) < new Date(entry.inTime)) entry.inTime = r.timestamp;
        }
        if (r.type === 'out') {
          if (!entry.outTime || new Date(r.timestamp) > new Date(entry.outTime)) entry.outTime = r.timestamp;
        }
      }
      
      let both = 0; let noCheckout = 0;
      const toLabelIn = (ts) => {
        const m = getMinutesFromTimestamp(ts);
        if (m < 540) return 'Before 9:00';
        if (m >= 540 && m < 570) return '9:00-9:29';
        if (m >= 570 && m < 600) return '9:30-9:59';
        if (m >= 600 && m < 660) return '10:00-10:59';
        return 'After 11:00';
      };
      const toLabelOut = (ts) => {
        const m = getMinutesFromTimestamp(ts);
        if (m < 990) return 'Before 4:30 PM';
        if (m >= 990 && m < 1020) return '4:30-4:59 PM';
        if (m >= 1020 && m < 1050) return '5:00-5:29 PM';
        if (m >= 1050 && m < 1080) return '5:30-6:00 PM';
        return 'After 6:00 PM';
      };
      const checkoutThresholdMinutes = 660;
      
      for (const [, e] of byStudent) {
        if (e.inTime) {
          const lIn = toLabelIn(e.inTime);
          countsIn.get(lIn).checkIn += 1;
          if (e.outTime) {
            both += 1;
            const outMins = getMinutesFromTimestamp(e.outTime);
            if (outMins >= checkoutThresholdMinutes) {
              countsIn.get(lIn).checkOut += 1;
              countsIn.get(lIn).veryLate += 1;
            }
          } else {
            noCheckout += 1;
            countsIn.get(lIn).noCheckout += 1;
          }
        }
      }
      
      for (const [, e] of byStudent) {
        if (e.outTime) {
          const lOut = toLabelOut(e.outTime);
          const bucket = countsOut.get(lOut);
          if (bucket) bucket.checkOut += 1;
        }
      }
      
      setPairedTotals({ both, noCheckout });
      setSlotSummary(slotLabelsIn.map(l => countsIn.get(l)));
      setSlotSummaryOut(slotLabelsOut.map(l => countsOut.get(l)));
      setExpandedSlotDetails({ slot: null, type: null, items: [] });
      
      try {
        const studentsRes = await axios.get('/api/students', { params: { limit: 10000 } });
        const allStudents = studentsRes.data?.students || [];
        const presentOrRecordedIds = new Set(
          list
            .map(r => r?.student?._id)
            .filter(Boolean)
        );
        const absent = allStudents.filter(s => !presentOrRecordedIds.has(s._id));
        setSlotAbsentStudents(absent);

        const checkInIds = new Set(
          list
            .filter(r => r?.type === 'in')
            .map(r => r?.student?._id)
            .filter(Boolean)
        );
        const noIn = allStudents.filter(s => !checkInIds.has(s._id));
        setNoCheckInCount(noIn.length || 0);
      } catch (err) {
        console.error('Failed to load Absenties:', err);
        setSlotAbsentStudents([]);
        setNoCheckInCount(0);
      }
    } catch (err) {
      console.error('Failed to load slot summary for date:', err);
      toast.error('Failed to load slot summary for selected date');
    }
  };

  const slotTotals = useMemo(() => {
    try {
      if (!slotSummary || slotSummary.length === 0) return { in: 0, out: 0, no: 0, absent: 0 };
      return slotSummary.reduce((acc, s) => {
        return {
          in: acc.in + (s.checkIn || 0),
          out: acc.out + (s.checkOut || 0),
          no: acc.no + (s.noCheckout || 0),
          absent: slotAbsentStudents.length || 0
        };
      }, { in: 0, out: 0, no: 0, absent: slotAbsentStudents.length || 0 });
    } catch (_) {
      return { in: 0, out: 0, no: 0, absent: 0 };
    }
  }, [slotSummary, slotAbsentStudents]);

  const slotTotalsOut = useMemo(() => {
    try {
      if (!slotSummaryOut || slotSummaryOut.length === 0) return { out: 0 };
      return slotSummaryOut.reduce((acc, s) => {
        return { out: acc.out + (s.checkOut || 0) };
      }, { out: 0 });
    } catch (_) {
      return { out: 0 };
    }
  }, [slotSummaryOut]);

  useEffect(() => {
    loadSlotSummaryForDate(slotDate, slotMode);
  }, [slotDate, slotMode]);

  return {
    slotDate,
    setSlotDate,
    slotMode,
    setSlotMode,
    slotWeek,
    setSlotWeek,
    slotMonth,
    setSlotMonth,
    slotAttendanceData,
    slotSummary,
    slotSummaryOut,
    noCheckInCount,
    pairedTotals,
    slotAbsentStudents,
    expandedSlotDetails,
    setExpandedSlotDetails,
    slotTotals,
    slotTotalsOut,
    loadSlotSummaryForDate
  };
};
