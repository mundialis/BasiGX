/* Copyright (c) 2015 terrestris GmbH & Co. KG
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */
/**
 * Overpass Search
 *
 * Used to search in the glorious dataset of OSM
 *
 * Example of usage:
 *     {
 *         xtype: 'basigx-search-overpass',
 *         clusterResults: true,
 *         viewboxlbrt: '52.4677,6.9186,53.9642,11.2308'
 *     }
 *
 * @class BasiGX.view.container.OverpassSearch
 */
Ext.define("BasiGX.view.container.OverpassSearch", {
    extend: "Ext.container.Container",
    xtype: "basigx-container-overpasssearch",

    requires: [
        'GeoExt.data.store.Features',
        'GeoExt.component.FeatureRenderer',

        'BasiGX.util.Animate',
        'BasiGX.util.Map',
        'BasiGX.util.MsgBox'
    ],

    viewModel: {
        data: {
            searchTermTextFieldLabel: 'Suchbegriff',
            searchCriteriaGridTitle: 'Suchkategorien',
            searchCriteriaLabelTag: 'OSM-Tag',
            searchCriteriaCategoryTag: 'Kategorie',
            searchCriteriaOccurenceTag: 'Tag-Häufigkeit',
            searchResultGridTitle: 'Suchergebnisse',
            resetBtnText: 'Zurücksetzen',
            noMatchesFoundErrText: 'Keine passenden Einträge gefunden'
        }
    },

    config: {
        /**
         * The URL to the overpass service
         */
        overpassUrl: 'http://overpass-api.de/api/interpreter',

        /**
         * The URL used to find tags for searchterms
         */
        tagFinderUrl: 'http://tagfinder.herokuapp.com/api/search',

        /**
         *
         */
        format: 'json',

        /**
         * limit the search results count
         */
        limit: 300,

        /**
         * The lat-lon viewbox to limit the searchquery to
         */
        viewboxlbrt: '90,-180,-90,180',

        /**
         * minimum chars to trigger the search
         */
        minSearchTextChars: 3,

        /**
         * delay before query gets triggered to avoid triggers while typing
         */
        typeDelay: 500,

        /**
         * the template to change the groups titles
         */
        groupHeaderTpl: '{type}',

        /**
         *
         */
        searchResultFeatureStyle: new ol.style.Style({
            image: new ol.style.Circle({
                radius: 6,
                fill: new ol.style.Fill({
                    color: '#8B0000'
                }),
                stroke: new ol.style.Stroke({
                    color: '#fff',
                    width: 2
                })
            }),
            fill: new ol.style.Fill({
                color: '#8B0000'
            }),
            stroke: new ol.style.Stroke({
                color: '#8B0000',
                width: 4
            })
        }),

        /**
         *
         */
        searchResultHighlightFeatureStyleFn: function(radius, text) {
            return new ol.style.Style({
                image: new ol.style.Circle({
                    radius: radius,
                    fill: new ol.style.Fill({
                        color: '#EE0000'
                    }),
                    stroke: new ol.style.Stroke({
                        color: 'gray',
                        width: 3
                    })
                }),
                text: text ? new ol.style.Text({
                    text: text.toString(),
                    fill: new ol.style.Fill({
                        color: '#fff'
                    })
                }) : undefined
            });
        },

        /**
         *
         */
        searchResultSelectFeatureStyle: new ol.style.Style({
            image: new ol.style.Circle({
                radius: 8,
                fill: new ol.style.Fill({
                    color: '#0099CC'
                }),
                stroke: new ol.style.Stroke({
                    color: '#fff',
                    width: 2
                })
            }),
            fill: new ol.style.Fill({
                color: '#0099CC'
            }),
            stroke: new ol.style.Stroke({
                color: '#0099CC',
                width: 6
            })
        }),

       /**
        *
        */
        clusterStyleFn: function(amount, radius) {
            // set maxradius
            var maxRadius = this.clusterLayer.getSource().distance_ / 2;
            if (radius > maxRadius) {
                radius = maxRadius;
            }
            return [new ol.style.Style({
                image: new ol.style.Circle({
                    radius: radius,
                    stroke: new ol.style.Stroke({
                        color: '#fff'
                    }),
                    fill: new ol.style.Fill({
                        color: '#3399CC'
                    })
                }),
                text: new ol.style.Text({
                    text: amount.toString(),
                    fill: new ol.style.Fill({
                        color: '#fff'
                    })
                })
            })];
        },

        /**
         *
         */
        highLightFeatureOnHoverInGrid: true
    },

    /**
     *
     */
    layout: 'fit',

    /**
     *
     */
    typeDelayTask: null,

    /**
     *
     */
    searchTerm: null,

    /**
     *
     */
    searchResultVectorLayer: null,

    /**
     *
     */
    clusterLayer: null,

    /**
     *
     */
    clusterResults: false,

    /**
     *
     */
    styleCache: [],

    /**
     *
     */
    map: null,

    /**
     *
     */
    initComponent: function() {
        var me = this;

        // set map
        me.map = BasiGX.util.Map.getMapComponent().getMap();

        if (!me.searchResultVectorLayer) {
            me.searchResultVectorLayer = new ol.layer.Vector({
                name: 'overpasssearchresult',
                source: new ol.source.Vector(),
                style: me.getSearchResultFeatureStyle(),
                visible: !me.clusterResults
            });
            me.map.addLayer(me.searchResultVectorLayer);
        }

        if (me.clusterResults && !me.clusterLayer) {
            var clusterSource = new ol.source.Cluster({
                distance: 40,
                source: me.searchResultVectorLayer.getSource()//new ol.source.Vector()
            });

            me.clusterLayer = new ol.layer.Vector({
                name: 'overpassclusterlayer',
                source: clusterSource,
                style: function(feature) {
                    var amount = feature.get('features').length;
                    var style = me.styleCache[amount];
                    if (!style) {
                        style = me.clusterStyleFn(amount, amount + 10);
                        me.styleCache[amount] = style;
                    }
                    return style;
                }
            });
            me.map.addLayer(me.clusterLayer);

            // correct the vectorlayerstyle for the grid symbolizer
            me.searchResultVectorLayer.setStyle(me.clusterStyleFn('', 8));
        }

        var tagFinderResultStore = Ext.create('Ext.data.Store', {
            sorters: [{
                property: 'countAll',
                direction: 'DESC'
            }],
            fields: [
                 'prefLabel',
                 {
                     name: 'termRelated',
                     type: 'string',
                     convert: function(val) {
                         return val.de[0] ? val.de[0] : '-';
                     }
                 },
                 'countAll'
            ]
        });

        var searchResultStore = Ext.create('GeoExt.data.store.Features', {
            map: me.map,
            layer: me.searchResultVectorLayer,
            groupField: 'type'
        });

        me.items = [
            {
                xtype: 'textfield',
                name: 'overpassSearchTerm',
                bind: {
                    fieldLabel: '{searchTermTextFieldLabel}'
                },
                enableKeyEvents: true,
                listeners: {
                    change: me.handleKeyDown
                }
            },
            {
                xtype: 'grid',
                name: 'tagfinderresultgrid',
                hidden: true,
                bind: {
                    title: '{searchCriteriaGridTitle}'
                },
                store: tagFinderResultStore,
                columns: [
                    {
                        dataIndex: 'prefLabel',
                        bind: {
                            text: '{searchCriteriaLabelTag}'
                        },
                        flex: 3,
                        renderer: function(value) {
                            return '<span data-qtip="' + value + '">' +
                                value + '</span>';
                        }
                    },
                    {
                        dataIndex: 'termRelated',
                        bind: {
                            text: '{searchCriteriaCategoryTag}'
                        },
                        flex: 3,
                        renderer: function(value) {
                            return '<span data-qtip="' + value + '">' +
                                value + '</span>';
                        }
                    },
                    {
                        dataIndex: 'countAll',
                        bind: {
                            text: '{searchCriteriaOccurenceTag}'
                        },
                        flex: 2
                    }
                ],
                width: 200,
                height: 300
            },
            {
                xtype: 'grid',
                name: 'overpasssearchresultgrid',
                hidden: true,
                hideHeaders: true,
                bind: {
                    title: '{searchResultGridTitle}'
                },
                store: searchResultStore,
                columns: [
                    {
                        xtype: 'widgetcolumn',
                        flex: 1,
                        widget: {
                            xtype: 'gx_renderer'
                        },
                        onWidgetAttach: function(column, gxRenderer, record) {
                            // update the symbolizer with the related feature
                            var feature = record.olObject;
                            gxRenderer.update({
                                feature: feature,
                                symbolizers: GeoExt.component.FeatureRenderer
                                    .determineStyle(record)
                            });
                        }
                    },
                    {
                        dataIndex: 'displayfield',
                        flex: 7,
                        renderer: function(value) {
                            return '<span data-qtip="' + value + '">' +
                                value + '</span>';
                        }
                    }
                ],
                features: [{
                    ftype: 'grouping',
                    groupHeaderTpl: me.getGroupHeaderTpl()
                }],
                width: 200,
                height: 300
            }, {
                xtype: 'button',
                bind: {
                    text: '{resetBtnText}'
                },
                margin: '10 0 0 0',
                handler: me.resetSearchGridAndText,
                scope: me
            }
        ];
        me.callParent(arguments);

        var grid = me.down('grid[name=overpasssearchresultgrid]');
        var tagFinderGrid = me.down('grid[name=tagfinderresultgrid]');

        me.on('tagfinderResponse', function(res) {
            tagFinderGrid.getStore().loadData(res);
            tagFinderGrid.show();
        });
        me.on('overpassResponse', me.showSearchResults, me);

        me.on('show', me.down('textfield').focus);

        if (me.getHighLightFeatureOnHoverInGrid()) {
            grid.on('itemmouseenter', me.highlightFeature, me);
            grid.on('itemmouseleave', me.unhighlightFeature, me);
        }
        grid.on('itemclick', me.highlightSelectedFeature, me);
        tagFinderGrid.on('itemclick', me.triggerSearch, me);
    },

    /**
     *
     */
    handleKeyDown: function(textfield) {
        var me = textfield.up('basigx-container-overpasssearch'),
            val = textfield.getValue();

        if (val.length < me.getMinSearchTextChars()) {
            return;
        }

        // set the searchterm on component
        me.searchTerm = val;

        // reset grid from old values
        me.resetGrids();

        // prepare the describeFeatureType for all given layers
        if (me.typeDelayTask) {
            me.typeDelayTask.cancel();
        }
        me.typeDelayTask = new Ext.util.DelayedTask(function(){
            me.findTagForSearchTerm();
        });
        me.typeDelayTask.delay(me.getTypeDelay());

    },

    /**
     *
     */
    resetSearchGridAndText: function() {
        var me = this;
        me.down('textfield[name=overpassSearchTerm]').setValue('');
        me.resetGrids();
    },

    /**
     *
     */
    resetGrids: function() {
        var me = this;
        var overpassGrid = me.down('grid[name=overpasssearchresultgrid]');
        var tagFinderGrid = me.down('grid[name=tagfinderresultgrid]');
        me.searchResultVectorLayer.getSource().clear(true);
        overpassGrid.hide();
        overpassGrid.getStore().removeAll();
        tagFinderGrid.hide();
        tagFinderGrid.getStore().removeAll();
    },

    /**
     * find osm tags for the searchterm
     */
    findTagForSearchTerm: function() {

        var me = this,
            results;

        var requestParams = {
            query: me.searchTerm,
            format: 'json',
            lang: 'de'
        };

        var url = me.getTagFinderUrl() + "?";
        Ext.iterate(requestParams, function(k, v) {
            url += k + "=" + encodeURIComponent(v) + "&";
        });

        me.setLoading(true);

        Ext.Ajax.request({
            url: url,
            success: function(response){
                me.setLoading(false);
                if(Ext.isString(response.responseText)) {
                    results = Ext.decode(response.responseText);
                } else if(Ext.isObject(response.responseText)) {
                    results = response.responseText;
                } else {
                    Ext.log.error("Error! Could not parse " +
                        "tagfinder response!");
                }
                if (results.length > 0) {
                    var tagArray = [];
                    Ext.each(results, function(res) {
                        if (res.isTag) {
                            tagArray.push(res);
                        }
                    });
                    me.fireEvent('tagfinderResponse', tagArray);
                } else {
                    BasiGX.util.MsgBox.info(me.getViewModel().get(
                            'noMatchesFoundErrText'));
                }

            },
            failure: function(response) {
                me.setLoading(false);
                Ext.log.error("Error on tagfinder request:",
                    response);
            }
        });
    },

    /**
     *
     */
    triggerSearch: function(grid, rec) {
        var me = this,
            tagFinderGrid = me.down('grid[name=tagfinderresultgrid]');

        if (tagFinderGrid.isVisible()) {
            tagFinderGrid.hide();
        }

        var requestParams = {
            data: '[out:' + me.getFormat() + '];'
        };

        requestParams.data += 'node[' + rec.data.prefLabel + ']';
        requestParams.data += '(' + me.getViewboxlbrt() + ');';
        requestParams.data += 'out ' + me.getLimit() + ' qt;';

        var url = me.getOverpassUrl() + "?";

        me.setLoading(true);

        Ext.Ajax.request({
            url: url,
            params: {data: requestParams.data},
            success: function(response){
                me.setLoading(false);
                var results;
                if(Ext.isString(response.responseText)) {
                    results = Ext.decode(response.responseText);
                } else if(Ext.isObject(response.responseText)) {
                    results = response.responseText;
                } else {
                    Ext.log.error("Error! Could not parse " +
                        "overpass response!");
                }
                me.fireEvent('overpassResponse', results);
            },
            failure: function(response) {
                me.setLoading(false);
                Ext.log.error("Error on overpass request:",
                    response);
            }
        });
    },

    showSearchResults: function(response) {

        var me = this,
            grid = me.down('grid[name=overpasssearchresultgrid]'),
            features = response.elements;

        if(features.length > 0){
            grid.show();
        }

        Ext.each(features, function(feature) {

            var olFeat = new ol.Feature({
                geometry: new ol.geom.Point(ol.proj.transform(
                    [parseFloat(feature.lon), parseFloat(feature.lat)], 'EPSG:4326', 'EPSG:3857'
                )),
                properties: feature
            });
            olFeat.set('displayfield', feature.tags.name || 'Kein Name gefunden');

            me.searchResultVectorLayer.getSource().addFeature(olFeat);
        });

        me.searchResultVectorLayer.setStyle(me.getSearchResultFeatureStyle());

        var featureExtent = me.searchResultVectorLayer.getSource().getExtent();
        if(!Ext.Array.contains(featureExtent, Infinity)){
            me.zoomToExtent(featureExtent);
        }
    },

    /**
     * Works with extent or geom.
     */
    zoomToExtent: function(extent){
        var me = this;
        var olView = me.map.getView();
        var pan = ol.animation.pan({
            source: olView.getCenter()
        });
        var zoom = ol.animation.zoom({
           resolution: olView.getResolution()
        });
        me.map.beforeRender(pan, zoom);

        olView.fit(extent, me.map.getSize());
    },

    /**
     * update the symbolizer in the grid
     */
    updateRenderer: function(item, style){
        var renderer = Ext.getCmp(
            Ext.query('div[id^=gx_renderer', true, item)[0].id);
        var src = renderer.map.getLayers().getArray()[0].getSource();
        src.getFeatures()[0].setStyle(style);
    },

    /**
     *
     */
    highlightFeature: function(tableView, record, item) {
        if(this.enterEventRec === record){
            return;
        }
        var feature;
        var radius;
        var text;

        this.enterEventRec = record;
        ol.Observable.unByKey(this.flashListenerKey);

        if (this.clusterResults) {
            feature = this.getClusterFeatureFromFeature(record.olObject);
            var featureStyle = this.clusterLayer.getStyle()(
                feature, this.map.getView().getResolution())[0];
            radius = featureStyle.getImage().getRadius();
            text = featureStyle.getText().getText();
        } else {
            feature = record.olObject;
            radius = 5; // default value
        }

        if (tableView.getSelection()[0] !== record) {
            feature.setStyle(
                this.getSearchResultHighlightFeatureStyleFn()(radius, text)
            );
            this.updateRenderer(item,
                this.getSearchResultHighlightFeatureStyleFn()(8, text)
            );
        }
        if (feature) {
            this.flashListenerKey = BasiGX.util.Animate.flashFeature(
                feature, 1000, radius);
        }
    },

    /**
     *
     */
    unhighlightFeature: function(tableView, record, item) {
        if(this.leaveEventRec === record){
            return;
        }
        this.leaveEventRec = record;
        if (tableView.getSelection()[0] !== record) {
            record.olObject.setStyle(this.getSearchResultFeatureStyle());
            if (this.clusterResults) {
                this.updateRenderer(item, this.clusterStyleFn('', 8));
            } else {
                this.updateRenderer(item, this.getSearchResultFeatureStyle());
            }
        }
    },

    /**
     *
     */
    highlightSelectedFeature: function(tableView, record, item) {
        record.olObject.setStyle(this.getSearchResultSelectFeatureStyle());
        this.updateRenderer(item, this.getSearchResultSelectFeatureStyle());
        this.zoomToExtent(record.olObject.getGeometry());
    },

    /**
     *
     */
    getClusterFeatureFromFeature: function(feature){
        var me = this;
        var clusterFeature;
        var clusterFeatures = me.clusterLayer.getSource().getFeatures();
        Ext.each(clusterFeatures, function(feat) {
            if (!Ext.isEmpty(feat.get('features'))) {
                Ext.each(feat.get('features'), function(f) {
                    if (f.getProperties().properties.id &&
                        feature.getProperties().properties.id &&
                        f.getProperties().properties.id ===
                        feature.getProperties().properties.id) {
                           clusterFeature = feat;
                           return false;
                    }
                });
            }
            if (!Ext.isEmpty(clusterFeature)) {
                return false;
            }
        });
        return clusterFeature ? clusterFeature : feature;
    }
});
