import React from 'react';

export default function ScheduleTab() {
  return (
    <div className="flex-1 flex flex-col gap-5 overflow-y-auto max-h-[75vh] px-1 pb-4">
       <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100/50">
        <h3 className="font-bold text-gray-800 text-base mb-3 flex items-center gap-2 border-b border-gray-100 pb-2">
          <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          Valley Road Campus ➔ Main Campus
        </h3>
        
        <div className="space-y-3">
          <div>
            <p className="text-xs font-bold text-sky-500 uppercase tracking-wider">Mon to Fri (Weekdays)</p>
            <p className="text-sm font-semibold text-gray-700 mt-0.5">6:20 a.m. | 5:00 p.m.</p>
          </div>

          <div>
            <p className="text-xs font-bold text-[#EAB308] uppercase tracking-wider">Sunday (Weekend)</p>
            <p className="text-sm font-semibold text-gray-700 mt-0.5">3:00 p.m. – 5:00 p.m.</p>
          </div>
        </div>

        <div className="mt-4 bg-amber-50 border border-amber-100 p-3 rounded-xl text-xs text-amber-800 leading-relaxed">
          <strong>⚠️ Parking Location:</strong> Weekday morning buses and Sunday evening buses park at the <strong>Entrance Gate</strong>. Weekday evening buses park at the <strong>Exit Gate</strong>.
        </div>
      </div>

      <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100/50">
        <h3 className="font-bold text-gray-800 text-base mb-3 flex items-center gap-2 border-b border-gray-100 pb-2">
          <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          Main Campus ➔ Valley Road Campus
        </h3>
        
        <div className="space-y-3">
          <div>
            <p className="text-xs font-bold text-sky-500 uppercase tracking-wider">Mon, Wed, Fri</p>
            <p className="text-sm font-semibold text-gray-700 mt-0.5">5:00 a.m. | 11:00 a.m. | 4:00 p.m. | 5:00 p.m.</p>
          </div>
          
          <div>
            <p className="text-xs font-bold text-sky-500 uppercase tracking-wider">Tue, Thu</p>
            <p className="text-sm font-semibold text-gray-700 mt-0.5">5:00 a.m. | 1:00 p.m. | 4:00 p.m. | 5:00 p.m.</p>
          </div>

          <div className="pt-1">
            <p className="text-xs font-bold text-[#EAB308] uppercase tracking-wider">Saturday (Weekend)</p>
            <p className="text-sm font-semibold text-gray-700 mt-0.5">9:00 a.m.</p>
          </div>
        </div>

        <div className="mt-4 bg-amber-50 border border-amber-100 p-3 rounded-xl text-xs text-amber-800 leading-relaxed">
          <strong>⚠️ Parking Location:</strong> The <strong>5:00 a.m.</strong> weekday bus and the <strong>Saturday</strong> bus park strictly at the <strong>Hope Centre Park</strong>.
        </div>
      </div>

      <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100/50">
        <h3 className="font-bold text-gray-800 text-base mb-3 flex items-center gap-2 border-b border-gray-100 pb-2">
          <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
          </svg>
          Fare & Bus Pass Rules
        </h3>
        
        <div className="space-y-3">
          <div className="flex justify-between items-center text-sm border-b border-gray-50 pb-1.5">
            <span className="text-gray-600">Before Gateway Mall ➔ Athi River</span>
            <span className="font-bold text-gray-800">200 Ksh</span>
          </div>
          <div className="flex justify-between items-center text-sm border-b border-gray-50 pb-1.5">
            <span className="text-gray-600">From Gateway Mall ➔ Athi River</span>
            <span className="font-bold text-gray-800">150 Ksh</span>
          </div>
          <div className="flex justify-between items-center text-sm border-b border-gray-50 pb-1.5">
            <span className="text-gray-600">Athi ➔ Past Gateway Mall (to Valley Road)</span>
            <span className="font-bold text-gray-800">200 Ksh</span>
          </div>
          <div className="flex justify-between items-center text-sm pb-1">
            <span className="text-gray-600">Athi ➔ Gateway Mall (or before)</span>
            <span className="font-bold text-gray-800">150 Ksh</span>
          </div>
        </div>

        <div className="mt-4 bg-blue-50 border border-blue-100 p-3 rounded-xl text-xs text-blue-800 leading-relaxed flex items-start gap-2">
          <svg className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
          </svg>
          <div>
            <strong>Bus Pass Validity:</strong> Bus Passes are strictly valid **ONLY** on the <strong>6:30 a.m.</strong> bus departing from Valley Road and the <strong>5:00 p.m.</strong> bus departing from Athi River.
          </div>
        </div>
      </div>
    </div>
  );
}