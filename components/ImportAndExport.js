import React, { useContext, useState } from 'react';
import { FirebaseContext } from '/util/firebase.js';
import { getFullSystem } from '/util/firebase.js';
import { doc, getDoc } from 'firebase/firestore';
import { Prompt } from '/components/Prompt.js';
import { renderFadeWrap } from '/util/helpers';
import { Modal } from '/components/Modal.js';
import { LINE_MODES, DEFAULT_LINE_MODE } from '/util/constants.js';

// Order properties of objects in a JSON object
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

// Format JSON string for readability
function formatJSON(obj) {
  const indentationLevel = 2; // set stringify indentation level
  const jsonString = JSON.stringify(obj, null, indentationLevel);
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

function sanitizeStationName(name) {
  if (!name) return '';

  return name
    .replace(/&/g, '&amp;')        // Ampersand
    .replace(/</g, '&lt;')         // Less-than
    .replace(/>/g, '&gt;')         // Greater-than
    .replace(/"/g, '&quot;')       // Double quote
    .replace(/'/g, '&apos;');      // Single quote
}

// Convert system data to KML format
function convertToKML(system) {
  const sanitizedTitle = sanitizeStationName(system.map.title);
  const sanitizedDescription = sanitizeStationName(system.map.caption);

  const kmlHeader = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${sanitizedTitle}</name>
    <description><![CDATA[${sanitizedDescription}]]></description>`;

  const kmlFooter = `
  </Document>
</kml>`;

  // Define styles for each line color
  const kmlStyles = Object.values(system.map.lines)
    .filter(line => line.stationIds && line.stationIds.length > 0) // Skip lines without stationIds
    .map(line => {
      const lineColor = line.color.slice(1); // Remove '#' from the hex color
      const reversedColor = `ff${lineColor.slice(4, 6)}${lineColor.slice(2, 4)}${lineColor.slice(0, 2)}`; // Reverse color for KML
      const styleId = `line-${lineColor}-5000-nodesc`;

      return `
    <Style id="${styleId}">
      <LineStyle>
        <color>${reversedColor}</color>
        <width>4</width>
      </LineStyle>
    </Style>`;
    }).join('');

  // Group lines by their appropriate folders
  const linesByFolder = {};

  Object.values(system.map.lines)
    .filter(line => line.stationIds && line.stationIds.length > 0) // Skip lines without stationIds
    .forEach(line => {
      let folderName;
      const lineGroup = system.map.lineGroups[line.lineGroupId];

      if (lineGroup) {
        folderName = sanitizeStationName(lineGroup.label);
      } else if (line.mode) {
        const mode = LINE_MODES.find(m => m.key === line.mode);
        folderName = mode ? sanitizeStationName(mode.label) : sanitizeStationName(DEFAULT_LINE_MODE);
      } else {
        folderName = "Metro/rapid transit";
      }

      if (!linesByFolder[folderName]) {
        linesByFolder[folderName] = [];
      }

      const sanitizedLineName = sanitizeStationName(line.name);
      const lineColor = line.color.slice(1); // Remove '#' from the hex color
      const styleUrl = `#line-${lineColor}-5000-nodesc`;

      const coordinates = line.stationIds.map(stationId => {
        const station = system.map.stations[stationId];
        if (!station) return null;

        const stationCoords = `${station.lng.toFixed(7)},${station.lat.toFixed(7)},0`;

        const waypointCoords = line.waypointOverrides?.[stationId]?.map(waypoint =>
          `${waypoint.lng.toFixed(7)},${waypoint.lat.toFixed(7)},0`
        ) || [];

        return [stationCoords, ...waypointCoords].join(' ');
      }).filter(coord => coord !== null).join(' ');

      linesByFolder[folderName].push(`
      <Placemark>
        <name>${sanitizedLineName}</name>
        <styleUrl>${styleUrl}</styleUrl>
        <LineString>
          <coordinates>${coordinates}</coordinates>
        </LineString>
      </Placemark>`);
    });

  // Sort folders alphabetically, except for the Stations folder
  const sortedKmlFolders = Object.entries(linesByFolder)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([folderName, placemarks]) => `
      <Folder>
        <name>${folderName}</name>
        ${placemarks.sort().join('')}
      </Folder>`).join('');

  const kmlStations = Object.values(system.map.stations)
    .filter(station => !station.isWaypoint)
    .map(station => {
      const sanitizedStationName = sanitizeStationName(station.name);
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
    }).sort().join('');

  const kmlContent = kmlHeader + kmlStyles + sortedKmlFolders + `
  <Folder>
    <name>Stations</name>
    ${kmlStations}
  </Folder>` + kmlFooter;

  return kmlContent;
}

// Main component for Import and Export
export function ImportAndExport({ systemId, isNew, isSaved, handleSave, onSetToast }) {
  const firebaseContext = useContext(FirebaseContext);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [prompt, setPrompt] = useState();

  // Main export function for JSON
  const exportSystemJSON = async () => {
    try {
      // Get system title and creator name
      const systemDoc = await getDoc(doc(firebaseContext.database, `systems/${systemId}`));
      const systemTitle = systemDoc.data().title || 'Untitled_Map';
      const creatorDoc = await getDoc(doc(firebaseContext.database, `users/${systemDoc.data().userId}`));
      const creatorName = creatorDoc.data().displayName || 'Unknown_Creator';

      // Get full system data and order properties
      const fullSystem = await getFullSystem(systemId);
      const orderedSystem = {
        title: fullSystem.map.title,
        caption: fullSystem.map.caption,
        map: {
          stations: orderProperties(fullSystem.map.stations, ['isWaypoint', 'name', 'grade', 'lat', 'lng']),
          interchanges: orderProperties(fullSystem.map.interchanges, ['stationIds']),
          lineGroups: orderProperties(fullSystem.map.lineGroups, ['label']),
          lines: orderProperties(fullSystem.map.lines, ['name', 'color', 'mode', 'lineGroupId', 'stationIds', 'waypointOverrides'])
        },
        meta: {
          systemNumStr: fullSystem.meta.systemNumStr,
          nextStationId: fullSystem.meta.nextStationId,
          nextInterchangeId: fullSystem.meta.nextInterchangeId,
          nextLineGroupId: fullSystem.meta.nextLineGroupId,
          nextLineId: fullSystem.meta.nextLineId
        }
      };
      const systemData = formatJSON(orderedSystem);

      // Create and download JSON file
      const blob = new Blob([systemData], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `MetroDreamin Map '${systemTitle}' by ${creatorName}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      onSetToast('Export successful!');
    } catch (error) {
      console.error('Error exporting system:', error);
      onSetToast('Export failed.');
    }
  };

  // Main export function for KML
  const exportSystemKML = async () => {
    try {
      // Get system title and creator name
      const systemDoc = await getDoc(doc(firebaseContext.database, `systems/${systemId}`));
      const systemTitle = systemDoc.data().title || 'Untitled_Map';
      const creatorDoc = await getDoc(doc(firebaseContext.database, `users/${systemDoc.data().userId}`));
      const creatorName = creatorDoc.data().displayName || 'Unknown_Creator';

      // Get full system data and convert to KML
      const fullSystem = await getFullSystem(systemId);
      const kmlData = convertToKML(fullSystem);

      // Create and download KML file
      const blob = new Blob([kmlData], { type: 'application/vnd.google-earth.kml+xml' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `MetroDreamin Map '${systemTitle}' by ${creatorName}.kml`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      onSetToast('Export successful!');
    } catch (error) {
      console.error('Error exporting system:', error);
      onSetToast('Export failed.');
    }
  };

  // JSON export button handler, with prompt for unsaved changes
  const handleExportJSON = async () => {
    setIsModalOpen(false);
    if (!isNew && !isSaved) {
      setPrompt({
        message: "You have unsaved changes. Do you want to save before exporting?",
        confirmText: "Yes, save and export.",
        denyText: "No, export without my changes.",
        confirmFunc: handleConfirmSaveJSON,
        denyFunc: handleDenySaveJSON,
      });
    } else {
      await exportSystemJSON();
    }
  };

  // KML export button handler, with prompt for unsaved changes
  const handleExportKML = async () => {
    setIsModalOpen(false);
    if (!isNew && !isSaved) {
      setPrompt({
        message: "You have unsaved changes. Do you want to save before exporting?",
        confirmText: "Yes, save and export.",
        denyText: "No, export without my changes.",
        confirmFunc: handleConfirmSaveKML,
        denyFunc: handleDenySaveKML,
      });
    } else {
      await exportSystemKML();
    }
  };

  // Handle saving before exporting JSON
  const handleConfirmSaveJSON = () => {
    setPrompt(null);
    handleSave(() => {
      exportSystemJSON();
    });
  };

  // Handle exporting JSON without saving
  const handleDenySaveJSON = async () => {
    setPrompt(null);
    exportSystemJSON();
  };

  // Handle saving before exporting KML
  const handleConfirmSaveKML = () => {
    setPrompt(null);
    handleSave(() => {
      exportSystemKML();
    });
  };

  // Handle exporting KML without saving
  const handleDenySaveKML = async () => {
    setPrompt(null);
    exportSystemKML();
  };

  // Render modal content
  const renderModalContent = () => (
    <div className="ImportAndExport-content">
      <div className="ImportAndExport-buttonWrap">
        <button className="ImportAndExport-button"
                data-tooltip-content="JSON is a commonly used data format to store and transmit data objects. It is human-readable and easy to parse."
                onClick={handleExportJSON}>
          <i className="fas fa-file-lines"></i>
          <span className="ImportAndExport-buttonText">Download system data as JSON {'{ , }'}</span>
        </button>
      </div>
      <div className="ImportAndExport-buttonWrap">
        <button className="ImportAndExport-button"
                data-tooltip-content="KML is a markup format used to display geographic data in an Earth browser, such as Google Maps and Google Earth."
                onClick={handleExportKML}>
          <i className="fas fa-file-code"></i>
          <span className="ImportAndExport-buttonText">Download system data as KML {'< / >'}</span>
        </button>
      </div>
    </div>
  );

  // Render component
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