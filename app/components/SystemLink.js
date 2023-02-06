import React, { useState, useEffect, useContext } from 'react';
import Link from 'next/link';
import ReactGA from 'react-ga';

import { FirebaseContext, getSystemDocData, getUserDocData } from '/lib/firebase.js';

export const SystemLink = ({ systemId }) => {
  const [systemDocData, setSystemDocData] = useState();
  const [ownerDocData, setOwnerDocData] = useState();

  const firebaseContext = useContext(FirebaseContext);

  useEffect(() => {
    if (systemId && !systemId.startsWith('defaultSystems/')) {
      getSystemDocData(systemId).then(sysDocData => setSystemDocData(sysDocData))
    }
  }, []);

  useEffect(() => {
    if (systemDocData && systemDocData.userId) {
      getUserDocData(systemDocData.userId).then(userDocData => setOwnerDocData(userDocData))
    }
  }, [systemDocData]);

  if (systemDocData && ownerDocData) {
    let starLinksContent;
    if (systemDocData.stars) {
      starLinksContent = (
        <span className="SystemLink-starText">
          {systemDocData.stars} {systemDocData.stars === 1 ? 'star' : 'stars'}
        </span>
      );
    }

    let ownerElem = ownerDocData ? (
      <div className="SystemLink-ownerStars">
        by {ownerDocData.displayName ? ownerDocData.displayName : 'Anonymous'}
        {starLinksContent ? ', ' : ''}
        {starLinksContent}
      </div>
    ) : null;

    if (firebaseContext.user && firebaseContext.user.uid === ownerDocData.userId) {
      ownerElem = (
        <span className="SystemLink-ownerStars">
          by <span className="SystemLink-youText">you!</span>
          {starLinksContent ? ', ' : ''}
          {starLinksContent}
        </span>
      );
    }

    const path = firebaseContext.user && firebaseContext.user.uid === systemDocData.userId ?
                  `/edit/${systemDocData.systemId}` :
                  `/view/${systemDocData.systemId}`;
    return (
      <Link className="SystemLink SystemLink--ready ViewLink" key={systemId} href={path}
            onClick={() => ReactGA.event({ category: 'Discover', action: 'Star Link' })}>
        <div className="SystemLink-title">
          {systemDocData.title ? systemDocData.title : 'Untitled'}
        </div>
        {ownerElem}
      </Link>
    );
  }

  return (
    <div className="SystemLink SystemLink--loading">
    </div>
  );
}