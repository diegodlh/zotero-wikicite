/* License */
import React, {
    useEffect,
    useState
} from 'react';
import { Button } from '../button';
import Citation from '../../citation';
import SourceItemWrapper from '../../sourceItemWrapper';
import { IntlProvider } from 'react-intl';
import OCI from '../../oci';
import PropTypes from 'prop-types';
import UuidTableRow from './uuidTableRow';
import Wikicite from '../../wikicite';
import ZoteroButton from './zoteroButton';
import WikidataButton from './wikidataButton';

/* global Services */
/* global window */
/* global Zotero */

function CitationsBox(props) {
    const [citations, setCitations] = useState([]);
    const [doi, setDoi] = useState('');
    const [occ, setOcc] = useState('');
    const [qid, setQid] = useState('');
    const [hasAttachments, setHasAttachments] = useState(false);

    const removeStr = Zotero.getString('general.remove');

    useEffect(() => {
        setCitations(props.sourceItem.citations);
        setDoi(props.sourceItem.doi);
        // Fixme: to avoid parsing the extra field twice, consider redefining
        // Wikicite.getExtraField to allow multiple fieldnames as input
        // and return a fieldName: [values]} object instead
        setOcc(props.sourceItem.occ ?? '');
        setQid(props.sourceItem.qid ?? '');
        setHasAttachments(
            Boolean(props.sourceItem.item.getAttachments().length)
        );
    }, [props.sourceItem]);

    /**
     * Opens the citation editor window.
     * @param {Citation} citation - Citation to be edited.
     * @param {Object} usedUUIDs - UUIDs used by other citations in the Citation List.
     * @returns {Zotero.Item} - Edited cited item.
     */
    function openEditor(citation, usedUUIDs) {
        const args = {
            citation: citation,
            usedUUIDs: usedUUIDs
        };
        const retVals = {};
        window.openDialog(
            'chrome://wikicite/content/editor.html',
            '',
            'chrome,dialog=no,modal,centerscreen,resizable=yes',
            args,
            retVals
        );
        return retVals.item;
    }

    function handleCitationAdd() {
        const citation = new Citation({
            item: {
                itemType: 'journalArticle'  // Fixme: maybe replace with a const
            },
            ocis: []
        }, props.sourceItem);
        const item = openEditor(citation, props.sourceItem.getUsedUUIDs());
        if (!item) {
            // Fixme: move console.log to wikicite debug
            console.log('Edit cancelled by user.');
            return;
        }
        if (
            qid && Wikicite.getExtraField(item, 'qid').values[0]
        ) {
            console.log('Source and target items have QIDs! Offer syncing to Wikidata.')
        }
        citation.target.item = item;


        // Make sure the component updates even before changes are saved to the item
        // setCitations(
        //   // sourceItem.citations  // this doesn't work because sourceItem.citation object's reference hasn't changed
        //   // () => sourceItem.citations  // works only one time per render - possibly because the function itself doesn't change
        //   [...sourceItem.citations]  // works
        // );
        // Problem is if I do this [...citations], the citations passed down to CitationsBox
        // are not the citations of the CitationsList here. Therefore, if I implement methods
        // in the Citation class to modify themselves, they won't work.

        // This will save changes to the item's extra field
        // The modified item observer above will be triggered.
        // This will update the sourceItem ref, and the component's state.
        props.sourceItem.addCitations(citation);
        // props.sourceItem.save();
        // Unexpectedly, this also triggers the zotero-items-tree `select` event
        // which in turn runs zoteroOverlay's refreshCitationsPaneMethod.
        // However, as props.item will not have changed, component will not update.
    }

    function handleCitationEdit(index) {
        const citation = citations[index];
        const item = openEditor(
            citation,
            props.sourceItem.getUsedUUIDs(index)
        );
        // Fixme: I don't like that I'm repeating code from addCitation
        // tagsBox has a single updateTags method instead
        if (!item) {
            // Fixme: move console.log to wikicite debug
            console.log('Edit cancelled by user.');
            return;
        }
        if (
            qid && Wikicite.getExtraField(item, 'qid').values[0]
        ) {
            console.log('Source and target items have QIDs! Offer syncing to Wikidata.')
        }
        citation.target.item = item;

        const newCitations = props.sourceItem.citations;
        newCitations[index] = citation;
        props.sourceItem.citations = newCitations;
    }

    async function handleCitationDelete(index) {
        let sync = false;
        const citation = citations[index];
        if (citation.getOCI('wikidata')) {
            // Fixme: offer to remember user choice
            // get this from preferences: remembered "delete remote too" choice
            // const remember = {value: false};
            const bttnFlags = (
                (Services.prompt.BUTTON_POS_0 * Services.prompt.BUTTON_TITLE_NO) +
                (Services.prompt.BUTTON_POS_1 * Services.prompt.BUTTON_TITLE_CANCEL) +
                (Services.prompt.BUTTON_POS_2 * Services.prompt.BUTTON_TITLE_YES) +
                Services.prompt.BUTTON_POS_2_DEFAULT
            );
            const response = Services.prompt.confirmEx(
                window,
                Wikicite.getString('wikicite.citationsPane.delete.remote.title'),
                Wikicite.getString('wikicite.citationsPane.delete.remote.message'),
                bttnFlags,
                "", "", "",
                undefined,  // Wikicite.getString('wikicite.citationsPane.delete.remote.remember'),
                {}  // remember
            );
            switch (response) {
                case 0:
                    // no
                    sync = false;
                    break
                case 1:
                    // cancel
                    return;
                case 2:
                    // yes
                    sync = true;
                    break
            }
        }
        await props.sourceItem.deleteCitation(index, sync);
    }

    function handleCitationMove(index, shift) {
        const newCitations = props.sourceItem.citations;
        const citation = newCitations.splice(index, 1)[0];
        const newIndex = index + shift;
        newCitations.splice(newIndex, 0, citation);
        props.sourceItem.citations = newCitations;
    }

    function handleCitationSync(index) {
        const citation = citations[index];
        const syncable = citation.source.qid && citation.target.qid;
        const oci = citation.getOCI('wikidata');
        if (oci) {
            if (oci.valid) {
                citation.resolveOCI('wikidata');
            } else {
                // oci is invalid, i.e., citing or cited id do not match with
                // local source or target id
                Services.prompt.alert(
                    window,
                    Wikicite.getString('wikicite.oci.mismatch.title'),
                    Wikicite.formatString(
                        'wikicite.oci.mismatch.message',
                        [
                            oci.supplier.charAt(0).toUpperCase() + oci.supplier.slice(1),
                            oci.idType.toUpperCase(),
                            oci.citingId,
                            oci.citedId
                        ]
                    )
                );
            }
        } else if (syncable) {
            props.sourceItem.syncWithWikidata(index);
        } else {
            Services.prompt.alert(
                window,
                'Citation cannot be synced',
                'Both citing and cited items must have a QID'
            );
        }
    }

    function handleDoiCommit(newDoi) {
        // setDoi(newDoi);
        props.sourceItem.doi = newDoi;
    }

    function handleOccCommit(newOcc) {
        // setOcc(newOcc);
        props.sourceItem.occ = newOcc;
    }

    function handleQidCommit(newQid) {
        // setQid(newQid);
        props.sourceItem.qid = newQid;
    }

    function handleDoiFetch() {
        alert('Fetching DOI not yet supported');
    }

    function handleOccFetch() {
        alert('Fetching OCC not yet supported');
    }

    function handleQidFetch() {
        props.sourceItem.fetchQid();
    }

    function renderCount() {
        var count = citations.length;
        var str = 'wikicite.citationsPane.citations.count.';
        // TODO: Switch to plural rules
        switch (count) {
            case 0:
                str += 'zero';
                break;
            case 1:
                str += 'singular';
                break;
            default:
                str += 'plural';
                break;
        }
        return Wikicite._bundle.formatStringFromName(str, [count], 1);
    }

    function renderCitationRow(citation, index) {
        let item = citation.target.item;
        const itemType = Zotero.ItemTypes.getName(item.itemTypeID);

        const isFirstCitation = index === 0;
        const isLastCitation = index === citations.length - 1;

        const label = citation.target.getLabel();
        return (
            <li
                className="citation"
                key={index}
            >
                <img
                    src={Zotero.ItemTypes.getImageSrc(itemType)}
                    title={Zotero.ItemTypes.getLocalizedString(itemType)}
                />
                <div
                    className="editable-container"
                    title={label}
                >
                    <div
                        className="editable"
                        onClick={ () => handleCitationEdit(index) }
                    >
                        <div className="zotero-clicky editable-content">
                            {label}
                        </div>
                    </div>
                </div>
                {props.editable && (
                    // https://github.com/babel/babel-sublime/issues/368
                <>
                    <ZoteroButton
                        citation={citation}
                    />
                    <WikidataButton
                        citation={citation}
                        onClick={() => handleCitationSync(index)}
                    />
                    <button
                        disabled={ isFirstCitation }
                        onClick={() => handleCitationMove(index, -1)}
                    >
                        <img
                            title="Move up"
                            src={`chrome://zotero/skin/citation-up.png`}
                        />
                    </button>
                    <button
                        disabled={ isLastCitation }
                        onClick={() => handleCitationMove(index, +1)}
                    >
                        <img
                            title="Move down"
                            src={`chrome://zotero/skin/citation-down.png`}
                        />
                    </button>
                    <button
                        title={removeStr}
                        onClick={ () => handleCitationDelete(index) }
                        tabIndex="-1"
                    >
                        <img
                            alt={removeStr}
                            title={removeStr}
                            // Fixme: does it change when active?
                            src={`chrome://zotero/skin/minus${Zotero.hiDPISuffix}.png`}/>
                    </button>
                    <button
                        className="btn-icon"
                        onClick={(event) => props.onCitationPopup(event, index)}
                    >
                        <span className="menu-marker"></span>
                    </button>
                </
                >
                )}
            </li>
        )
    }

    return (
        <div className="citations-box">
            <div className="citations-box-header">
                <div className="citations-box-count">{renderCount()}</div>
                { props.editable &&
                    <div>
                        <button onClick={() => handleCitationAdd()}>
                            {Wikicite.getString('wikicite.citationsPane.add')}
                        </button>
                    </div>
                }
                <IntlProvider
                    locale={Zotero.locale}
                    // Fixme: improve messages object
                    messages={{
                        'wikicite.citationsPane.more': Wikicite.getString(
                            'wikicite.citationsPane.more'
                        )
                    }}
                >
                    <Button
                        /*icon={
                            <span>
                                <img
                                    height="16px"
                                    src="chrome://wikicite/skin/wikicite.png"
                                />
                            </span>
                        }*/
                        className="citations-box-actions"
                        isMenu={true}
                        onClick={props.onItemPopup}
                        text="wikicite.citationsPane.more"
                        title=""
                        size="sm"
                    />
                </IntlProvider>
            </div>
            <div className="citations-box-list-container">
                <ul className="citations-box-list">
                    {/* Fixme: do not use index as React key - reorders will be slow!
                    https://reactjs.org/docs/reconciliation.html#keys
                    What about using something like bibtex keys?*/}
                    {/* Maybe in the future the index of the Citation in the CitationList
                    will be a property of the Citation itself */}
                    {citations.map((citation, index) => renderCitationRow(citation, index))}
                </ul>
            {/* I understand this bit here makes TAB create a new tag
                { props.editable && <span
                    tabIndex="0"
                    onFocus={handleAddTag}
                /> }
                 */}
            </div>
            <div className="citations-box-footer">
                <table className="citations-box-uuids">
                    <tbody>
                        <UuidTableRow
                            editable={props.editable}
                            label="QID"
                            onCommit={handleQidCommit}
                            onFetch={handleQidFetch}
                            value={qid}
                        />
                        <UuidTableRow
                            editable={props.editable}
                            label="DOI"
                            onCommit={handleDoiCommit}
                            onFetch={handleDoiFetch}
                            value={doi}
                        />
                        <UuidTableRow
                            editable={props.editable}
                            label="OCC"
                            onCommit={handleOccCommit}
                            onFetch={handleOccFetch}
                            value={occ}
                        />
                    </tbody>
                </table>
                {/*<div className="citations-box-footer-buttons" style={{display: "flex"}}>
                    <button
                        onClick={() => props.sourceItem.getFromPDF()}
                        disabled={!hasAttachments}
                    >Extract from attachments</button>
                    <button
                        onClick={() => props.sourceItem.exportToCroci()}
                        disabled={!doi}
                    >Export to CROCI</button>
                </div>*/}
            </div>
        </div>
    );
}

CitationsBox.propTypes = {
    editable: PropTypes.bool,
    sourceItem: PropTypes.instanceOf(SourceItemWrapper),
    onItemPopup: PropTypes.func,
    onCitationPopup: PropTypes.func
};

export default CitationsBox;
