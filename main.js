const PAGES = [
  {
    targetIndex: 0,
    title: "The Land of Tambunan",
    model: "page-01.glb",
    scale: 0.35,
    y: -0.2
  },
  // Add the remaining story pages here
];

const anchor = mindar.addAnchor(page.targetIndex);

anchor.onTargetFound = () => {
  loader.load(`./assets/models/${page.model}`, (gltf) => {
    gltf.scene.scale.setScalar(page.scale);
    gltf.scene.position.set(0, page.y, 0);
    anchor.group.add(gltf.scene);
  });
};
