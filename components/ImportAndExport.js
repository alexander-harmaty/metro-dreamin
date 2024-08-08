import React, { useContext, useState } from 'react';
import { FirebaseContext } from '/util/firebase.js';
import { getFullSystem } from '/util/firebase.js';
import { doc, getDoc } from 'firebase/firestore';
import { Prompt } from '/components/Prompt.js';
import { renderFadeWrap } from '/util/helpers';
import { Modal } from '/components/Modal.js';

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

// Sanitize station names for KML compatibility
function sanitizeStationName(name) {
  // Replace ampersands with "and"
  let sanitized = name.replace(/&/g, 'and');
  
  // Remove any other problematic characters (e.g., < > " ')
  sanitized = sanitized.replace(/[<>\"']/g, '');
  return sanitized;
}

// Convert system data to KML format
function convertToKML(system) {
  const kmlHeader = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${system.title}</name>
    <description>${system.caption}</description>
    <Style id="icon-1899-0288D1-nodesc-normal">
      <IconStyle>
        <color>ffd18802</color>
        <scale>1</scale>
        <Icon>
          <href>https://www.gstatic.com/mapspro/images/stock/503-wht-blank_maps.png</href>
        </Icon>
        <hotSpot x="32" xunits="pixels" y="64" yunits="insetPixels"/>
      </IconStyle>
      <LabelStyle>
        <scale>0</scale>
      </LabelStyle>
      <BalloonStyle>
        <text><![CDATA[<h3>$[name]</h3>]]></text>
      </BalloonStyle>
    </Style>
    <Style id="icon-1899-0288D1-nodesc-highlight">
      <IconStyle>
        <color>ffd18802</color>
        <scale>1</scale>
        <Icon>
          <href>https://www.gstatic.com/mapspro/images/stock/503-wht-blank_maps.png</href>
        </Icon>
        <hotSpot x="32" xunits="pixels" y="64" yunits="insetPixels"/>
      </IconStyle>
      <LabelStyle>
        <scale>1</scale>
      </LabelStyle>
      <BalloonStyle>
        <text><![CDATA[<h3>$[name]</h3>]]></text>
      </BalloonStyle>
    </Style>
    <StyleMap id="icon-1899-0288D1-nodesc">
      <Pair>
        <key>normal</key>
        <styleUrl>#icon-1899-0288D1-nodesc-normal</styleUrl>
      </Pair>
      <Pair>
        <key>highlight</key>
        <styleUrl>#icon-1899-0288D1-nodesc-highlight</styleUrl>
      </Pair>
    </StyleMap>
    <Folder>
      <name>Stations</name>`;

  const kmlFooter = `
    </Folder>
  </Document>
</kml>`;

  const kmlPlacemarks = Object.values(system.map.stations)
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
    }).join('');

  const kmlContent = kmlHeader + kmlPlacemarks + kmlFooter;
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