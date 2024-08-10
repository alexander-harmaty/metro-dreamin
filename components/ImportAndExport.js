import React, { useContext, useState } from 'react';
import { FirebaseContext } from '/util/firebase.js';
import { getFullSystem } from '/util/firebase.js';
import { doc, getDoc } from 'firebase/firestore';
import { Prompt } from '/components/Prompt.js';
import { renderFadeWrap } from '/util/helpers';
import { Modal } from '/components/Modal.js';
import { LINE_MODES, DEFAULT_LINE_MODE } from '/util/constants.js';

export function ImportAndExport({ systemId, isNew, isSaved, handleSave, onSetToast }) {
  const firebaseContext = useContext(FirebaseContext);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [prompt, setPrompt] = useState();

  const exportSystem = async (formatFn, fileType, fileExtension, mimeType) => {
    try {
      const systemDoc = await getDoc(doc(firebaseContext.database, `systems/${systemId}`));
      const systemTitle = systemDoc.data().title || 'Untitled_Map';
      const creatorDoc = await getDoc(doc(firebaseContext.database, `users/${systemDoc.data().userId}`));
      const creatorName = creatorDoc.data().displayName || 'Unknown_Creator';

      const fullSystem = await getFullSystem(systemId);
      const formattedData = formatFn(fullSystem);

      const blob = new Blob([formattedData], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `MetroDreamin Map '${systemTitle}' by ${creatorName}.${fileExtension}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      onSetToast('Export successful!');
    } catch (error) {
      console.error(`Error exporting system: ${error}`);
      onSetToast('Export failed.');
    }
  };

  const handleExport = async (formatFn, fileType, fileExtension, mimeType) => {
    setIsModalOpen(false);
    if (!isNew && !isSaved) {
      setPrompt({
        message: "You have unsaved changes. Do you want to save before exporting?",
        confirmText: "Yes, save and export.",
        denyText: "No, export without my changes.",
        confirmFunc: () => {
          setPrompt(null);
          handleSave(() => exportSystem(formatFn, fileType, fileExtension, mimeType));
        },
        denyFunc: async () => {
          setPrompt(null);
          await exportSystem(formatFn, fileType, fileExtension, mimeType);
        },
      });
    } else {
      await exportSystem(formatFn, fileType, fileExtension, mimeType);
    }
  };

  const renderModalContent = () => (
    <div className="ImportAndExport-content">
      <div className="ImportAndExport-buttonWrap">
        <button className="ImportAndExport-button"
                data-tooltip-content="JSON is a popular and human-readable data format to store and transmit data objects for use in a diverse range of applications."
                onClick={() => handleExport(serializeToJSON, 'JSON', 'json', 'application/json')}>
          <i className="fas fa-file-lines"></i>
          <span className="ImportAndExport-buttonText">Download system data as JSON {'{ , }'}</span>
        </button>
      </div>
      <div className="ImportAndExport-buttonWrap">
        <button className="ImportAndExport-button"
                data-tooltip-content="KML is a markup format to store geodata for use in maps like Google Earth. (large maps may be too big for Google My Maps)"
                onClick={() => handleExport(serializeToKML, 'KML', 'kml', 'application/vnd.google-earth.kml+xml')}>
          <i className="fas fa-file-code"></i>
          <span className="ImportAndExport-buttonText">Download system data as KML {'< / >'}</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="ImportAndExport">
      <button className="ImportAndExport-openButton"
              data-tooltip-content="Import or export system data"
              onClick={() => setIsModalOpen(true)}>
        <i className="fas fa-download"></i>
      </button>

      {renderFadeWrap(
        prompt && (
          <Prompt
            message={prompt.message}
            denyText={prompt.denyText}
            confirmText={prompt.confirmText}
            denyFunc={prompt.denyFunc}
            confirmFunc={prompt.confirmFunc}
          />
        ),
        'prompt'
      )}

      <Modal 
        baseClass='ImportAndExport'
        open={isModalOpen}
        heading={<div className="ImportAndExport-heading">Import and Export</div>}
        content={renderModalContent()}
        onClose={() => setIsModalOpen(false)}
      />
    </div>
  );
}

function serializeToJSON(system) {

  function orderProperties(obj, order) {
    const orderedObj = {};
    Object.keys(obj).forEach(key => {
      const orderedSubObj = {};
      order.forEach(prop => {
        if (obj[key][prop] !== undefined) {
          orderedSubObj[prop] = obj[key][prop];
        }
      });
      orderedObj[key] = orderedSubObj;
    });
    return orderedObj;
  }

  const orderedSystem = {
    title: system.map.title,
    caption: system.map.caption,
    map: {
      stations: orderProperties(system.map.stations, ['isWaypoint', 'name', 'grade', 'lat', 'lng']),
      interchanges: orderProperties(system.map.interchanges, ['stationIds']),
      lineGroups: orderProperties(system.map.lineGroups, ['label']),
      lines: orderProperties(system.map.lines, ['name', 'color', 'mode', 'lineGroupId', 'stationIds', 'waypointOverrides'])
    },
    meta: {
      systemNumStr: system.meta.systemNumStr,
      nextStationId: system.meta.nextStationId,
      nextInterchangeId: system.meta.nextInterchangeId,
      nextLineGroupId: system.meta.nextLineGroupId,
      nextLineId: system.meta.nextLineId
    }
  };

  const indentationLevel = 2; // set stringify indentation level
  const jsonString = JSON.stringify(orderedSystem, null, indentationLevel);
  const spc = ' '.repeat(indentationLevel); // dynamic indentation spacing

  return jsonString                                                             // Affected objects, properties, and elements...
    // Remove newlines at the opening of objects and arrays
    .replace(/\{\n\s+"name"/g, '{ "name"')                                      // stations and lines
    .replace(/\{\n\s+"isWaypoint"/g, '{ "isWaypoint"')                          // stations
    .replace(/\{\n\s+"stationIds"/g, '{ "stationIds"')                          // interchanges and lines
    .replace(/\{\n\s+"label"/g, '{ "label"')                                    // linegroups
    .replace(/\[\n\s+"/g, '[ "')                                                // stationIds and waypointOverrides

    // Remove newlines between object properties and array elements
    .replace(/",\n\s+"/g, '", "')                                               // most properties and elements
    .replace(/,\n\s+"grade"/g, ', "grade"')                                     // stations
    .replace(/,\n\s+"lat"/g, ', "lat"')                                         // stations
    .replace(/,\n\s+"lng"/g, ', "lng"')                                         // stations
    .replace(/"\n\s+\],\n\s+"waypointOverrides"/g, '" ], "waypointOverrides"')  // lines

    // Remove newlines at the closing of objects and arrays
    .replace(/\n\s+\},/g, ' },')                                                // succeeded objects
    .replace(/\n\s+\}\s+\},/g, ` }\n${spc}${spc}},`)                            // last objects
    .replace(/\n\s+\]\s+\},/g, ' ] },')                                         // succeeded arrays         
    .replace(/\n\s+\]\s+\}/g, ' ] }')                                           // last arrays
    .replace(/\[\]\n\s+\}/g, '[] }')                                            // empty arrays

    // Correct unintended changes
    .replace('", "caption"', `",\n${spc}"caption"`)   // Fix caption property
    .replace('", "map"', `",\n${spc}"map"`)           // Fix map property
    .replace(/\}\n\s+\},\n\s+"meta"/, 
      `\n${spc}${spc}}\n${spc}},\n${spc}"meta"`)      // Fix meta property
    ;
}

function serializeToKML(system) {
  
  function sanitizeString(name) {
    if (!name) return '';
  
    return name
      .replace(/&/g, '&amp;')        // Ampersand
      .replace(/</g, '&lt;')         // Less-than
      .replace(/>/g, '&gt;')         // Greater-than
      .replace(/"/g, '&quot;')       // Double quote
      .replace(/'/g, '&apos;');      // Single quote
  }

  const sanitizedTitle = sanitizeString(system.map.title);
  const sanitizedDescription = sanitizeString(system.map.caption);

  const kmlHeader = generateKMLHeader(sanitizedTitle, sanitizedDescription);
  const kmlFooter = generateKMLFooter();
  const kmlStyles = generateKMLStyles(system);
  const kmlStations = generateKMLStations(system);
  const sortedKmlFolders = generateKMLFolders(system);

  return kmlHeader + kmlStyles + kmlStations + sortedKmlFolders + kmlFooter;

  function generateKMLHeader(title, description) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${title}</name>
    <description><![CDATA[${description}]]></description>
`;
  }

  function generateKMLFooter() {
    return `
  </Document>
</kml>`;
  }

  function generateKMLStyles(system) {
    return Object.values(system.map.lines)
      .filter(line => line.stationIds && line.stationIds.length > 0) // Skip lines without stationIds
      .map(line => {
        const lineColor = line.color.slice(1); // Remove '#' from the hex color
        const reversedColor = `ff${lineColor.slice(4, 6)}${lineColor.slice(2, 4)}${lineColor.slice(0, 2)}`; // Reverse color for KML
        const styleId = `line-${lineColor}-10666-nodesc`;

        return `
    <Style id="${styleId}">
      <LineStyle>
        <color>${reversedColor}</color>
        <width>6</width>
      </LineStyle>
    </Style>`;
      }).join('');
  }

  function generateKMLStations(system) {
    return `
  <Folder>
    <name>Stations</name>
    ${Object.values(system.map.stations)
      .filter(station => !station.isWaypoint)
      .map(station => {
        const sanitizedStationName = sanitizeString(station.name);
        const lng = station.lng.toFixed(7);
        const lat = station.lat.toFixed(7);
        return `
      <Placemark>
        <name>${sanitizedStationName}</name>
        <styleUrl>#icon-1899-0288D1-nodesc</styleUrl>
        <Point>
          <coordinates>${lng},${lat},0</coordinates>
        </Point>
      </Placemark>`;
      }).sort().join('')}
  </Folder>`;
  }

  function generateKMLFolders(system) {
    const linesByFolder = organizeLinesByFolder(system);

    return Object.entries(linesByFolder)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([folderName, placemarks]) => createFolderKML(folderName, placemarks))
      .join('');
  }

  function organizeLinesByFolder(system) {
    const linesByFolder = {};

    Object.values(system.map.lines)
      .filter(line => line.stationIds && line.stationIds.length > 0)
      .forEach(line => {
        const folderName = determineFolderName(line, system);
        if (!linesByFolder[folderName]) {
          linesByFolder[folderName] = [];
        }

        const lineKML = createLineKML(line, system);
        linesByFolder[folderName].push(lineKML);
      });

    return linesByFolder;
  }

  function createFolderKML(folderName, placemarks) {
    return `
  <Folder>
    <name>${folderName}</name>
    ${placemarks.sort().join('')}
  </Folder>`;
  }

  function createLineKML(line, system) {
    const sanitizedLineName = sanitizeString(line.name);
    const lineColor = line.color.slice(1);
    const styleUrl = `#line-${lineColor}-10666-nodesc`;

    const coordinates = line.stationIds.map(stationId => {
      const station = system.map.stations[stationId];
      if (!station) return null;

      const stationCoords = `${station.lng.toFixed(7)},${station.lat.toFixed(7)},0`;

      const waypointCoords = line.waypointOverrides?.[stationId]?.map(waypoint =>
        `${waypoint.lng.toFixed(7)},${waypoint.lat.toFixed(7)},0`
      ) || [];

      return [stationCoords, ...waypointCoords].join(' ');
    }).filter(coord => coord !== null).join(' ');

    return `
  <Placemark>
    <name>${sanitizedLineName}</name>
    <styleUrl>${styleUrl}</styleUrl>
    <LineString>
      <coordinates>${coordinates}</coordinates>
    </LineString>
  </Placemark>`;
  }

  function determineFolderName(line, system) {
    const lineGroup = system.map.lineGroups[line.lineGroupId];

    if (lineGroup) {
      return sanitizeString(lineGroup.label);
    } else if (line.mode) {
      const mode = LINE_MODES.find(m => m.key === line.mode);
      return mode ? sanitizeString(mode.label) : sanitizeString(DEFAULT_LINE_MODE);
    } else {
      return "Metro/rapid transit";
    }
  }
}