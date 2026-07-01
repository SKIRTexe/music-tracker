"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ComposableMap, Geographies, Geography, type Geography as GeoType } from "react-simple-maps";

const GEO_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

// ISO 3166-1 numeric (3-digit string) → alpha-2
const NUM_TO_A2: Record<string, string> = {
  "004":"AF","008":"AL","012":"DZ","024":"AO","031":"AZ","032":"AR",
  "036":"AU","040":"AT","048":"BH","050":"BD","056":"BE","064":"BT",
  "068":"BO","072":"BW","076":"BR","096":"BN","100":"BG","104":"MM",
  "108":"BI","112":"BY","116":"KH","120":"CM","124":"CA","140":"CF",
  "144":"LK","148":"TD","152":"CL","156":"CN","170":"CO","178":"CG",
  "180":"CD","188":"CR","191":"HR","192":"CU","196":"CY","203":"CZ",
  "204":"BJ","208":"DK","214":"DO","218":"EC","222":"SV","231":"ET",
  "246":"FI","250":"FR","266":"GA","268":"GE","276":"DE","288":"GH",
  "300":"GR","320":"GT","324":"GN","332":"HT","340":"HN","348":"HU",
  "352":"IS","356":"IN","360":"ID","364":"IR","368":"IQ","372":"IE",
  "376":"IL","380":"IT","384":"CI","388":"JM","392":"JP","398":"KZ",
  "400":"JO","404":"KE","408":"KP","410":"KR","414":"KW","417":"KG",
  "418":"LA","422":"LB","426":"LS","428":"LV","430":"LR","434":"LY",
  "440":"LT","442":"LU","450":"MG","454":"MW","458":"MY","466":"ML",
  "470":"MT","478":"MR","480":"MU","484":"MX","492":"MC","496":"MN",
  "504":"MA","508":"MZ","516":"NA","524":"NP","528":"NL","548":"VU",
  "554":"NZ","558":"NI","562":"NE","566":"NG","578":"NO","583":"FM",
  "585":"PW","586":"PK","591":"PA","598":"PG","600":"PY","604":"PE",
  "608":"PH","616":"PL","620":"PT","626":"TL","634":"QA","642":"RO",
  "643":"RU","646":"RW","682":"SA","686":"SN","688":"RS","694":"SL",
  "703":"SK","704":"VN","705":"SI","706":"SO","710":"ZA","716":"ZW",
  "724":"ES","728":"SS","729":"SD","740":"SR","748":"SZ","752":"SE",
  "756":"CH","760":"SY","762":"TJ","764":"TH","768":"TG","776":"TO",
  "780":"TT","784":"AE","788":"TN","792":"TR","795":"TM","800":"UG",
  "804":"UA","807":"MK","818":"EG","826":"GB","834":"TZ","840":"US",
  "854":"BF","858":"UY","860":"UZ","862":"VE","882":"WS","887":"YE",
  "894":"ZM","051":"AM",
};

export function WorldMapPicker({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [tooltip, setTooltip] = useState<string | null>(null);

  const handleClick = (geoId: string, name: string) => {
    const iso = NUM_TO_A2[geoId];
    if (!iso) return;
    onClose();
    router.push(`/location/${iso}`);
  };

  return (
    <div className="relative">
      {/* Tooltip */}
      <div className={`text-center text-xs text-zinc-300 h-5 mb-1 transition-opacity ${tooltip ? "opacity-100" : "opacity-0"}`}>
        {tooltip ?? ""}
      </div>

      <ComposableMap
        projection="geoMercator"
        projectionConfig={{ scale: 120, center: [0, 20] }}
        style={{ width: "100%", height: "auto" }}
      >
        <Geographies geography={GEO_URL}>
          {({ geographies }: { geographies: GeoType[] }) =>
            geographies.map((geo: GeoType) => {
              const iso = NUM_TO_A2[geo.id as string];
              const clickable = !!iso;
              return (
                <Geography
                  key={geo.rsmKey}
                  geography={geo}
                  onMouseEnter={() => setTooltip(geo.properties.name as string)}
                  onMouseLeave={() => setTooltip(null)}
                  onClick={() => handleClick(geo.id as string, geo.properties.name as string)}
                  style={{
                    default: {
                      fill: clickable ? "#3f3f46" : "#27272a",
                      stroke: "#18181b",
                      strokeWidth: 0.5,
                      outline: "none",
                    },
                    hover: {
                      fill: clickable ? "#71717a" : "#27272a",
                      stroke: "#18181b",
                      strokeWidth: 0.5,
                      outline: "none",
                      cursor: clickable ? "pointer" : "default",
                    },
                    pressed: {
                      fill: clickable ? "#a1a1aa" : "#27272a",
                      stroke: "#18181b",
                      strokeWidth: 0.5,
                      outline: "none",
                    },
                  }}
                />
              );
            })
          }
        </Geographies>
      </ComposableMap>
    </div>
  );
}
