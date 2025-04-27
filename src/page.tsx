"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Image from "next/image";
import { ArrowLeft, Star, Calendar, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { projectsData } from "@/data/projects";
import ProjectGallery from "@/components/project-gallery";
import ProjectVideo from "@/components/project-video";

export default function ProjectPage() {
  const params = useParams();
  const router = useRouter();
  const [project, setProject] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (params.id) {
      const foundProject = projectsData.find((p) => p.id === params.id);
      if (foundProject) {
        setProject(foundProject);
      } else {
        router.push("/");
      }
    }
    setLoading(false);
  }, [params.id, router]);

  if (loading || !project) {
    return (
      <div className="min-h-screen flex items-center justify-center fluid-background">
        <div className="w-16 h-16 border-4 border-t-teal-500 border-teal-200/20 rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <main className="min-h-screen pt-20 pb-16 mesh-gradient noise-texture relative overflow-hidden">
      {/* Decorative elements */}
      <div className="absolute inset-0 z-0 overflow-hidden">
        {/* Animated glowing orbs */}
        <div className="absolute top-20 left-[10%] w-64 h-64 rounded-full bg-teal-500/5 blur-3xl animate-float-slow"></div>
        <div className="absolute bottom-40 right-[5%] w-80 h-80 rounded-full bg-purple-500/5 blur-3xl animate-float-medium"></div>
        <div className="absolute top-1/2 left-1/3 w-96 h-96 rounded-full bg-blue-500/5 blur-3xl animate-float-fast"></div>

        {/* Grid pattern overlay */}
        <div className="grid-pattern w-full h-full absolute inset-0"></div>
      </div>

      {/* Project Header */}
      <div className="relative py-16 overflow-hidden z-10">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <Button
            variant="ghost"
            size="sm"
            className="mb-6 text-gray-400 hover:text-teal-400 bg-gray-900/50 backdrop-blur-sm"
            onClick={() => router.back()}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Projects
          </Button>

          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="bg-gray-900/50 backdrop-blur-md p-4 rounded-lg shadow-lg inline-block border border-gray-800">
              <h1 className="text-3xl md:text-4xl font-bold text-white text-glow">
                {project.title}
              </h1>
            </div>
          </div>

          <div className="flex flex-wrap gap-3 mt-4">
            {project.tags.map((tag: string, index: number) => (
              <Badge
                key={index}
                variant="outline"
                className="bg-gray-900/50 text-teal-400 border-teal-800/50 backdrop-blur-sm"
              >
                {tag}
              </Badge>
            ))}
          </div>

          <div className="flex items-center gap-6 mt-6 text-sm bg-gray-900/50 backdrop-blur-sm p-3 rounded-lg inline-flex border border-gray-800">
            {project.date && (
              <div className="flex items-center">
                <Calendar className="mr-2 h-4 w-4 text-teal-400" />
                {project.date}
              </div>
            )}
            {project.client && (
              <div className="flex items-center">
                <Tag className="mr-2 h-4 w-4 text-teal-400" />
                Client: {project.client}
              </div>
            )}
            {project.rating && (
              <div className="flex items-center">
                <Star className="mr-2 h-4 w-4 text-teal-400" />
                {project.rating} Rating
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 sm:px-6 lg:px-8 mt-8 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2 ">
            <Tabs defaultValue="overview" className="w-full">
              <TabsList className="w-full justify-start mb-8 bg-gray-900/50 backdrop-blur-sm rounded-lg border border-gray-800">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="gallery">Gallery</TabsTrigger>
                {project.hasVideo && (
                  <TabsTrigger value="videos">Videos</TabsTrigger>
                )}
                <TabsTrigger value="features">Features</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="space-y-6">
                <Card className="border-none shadow-xl card-dark">
                  <CardContent className="p-6">
                    <h2 className="text-2xl font-semibold mb-4 text-white">
                      Project Overview
                    </h2>
                    <div className="prose prose-invert max-w-none">
                      <p className="text-gray-300">{project.description}</p>

                      {project.longDescription && (
                        <div className="mt-4">
                          {project.longDescription.map(
                            (paragraph: string, idx: number) => (
                              <p key={idx} className="text-gray-300 mb-4">
                                {paragraph}
                              </p>
                            )
                          )}
                        </div>
                      )}
                    </div>

                    {/* Featured Image */}
                    <div className="mt-8 rounded-lg overflow-hidden shadow-lg border border-gray-800">
                      <Image
                        src={project.image || "/placeholder.svg"}
                        alt={project.title}
                        width={800}
                        height={450}
                        className="w-full h-auto object-cover"
                      />
                    </div>
                  </CardContent>
                </Card>

                {/* Challenges and Solutions */}
                {(project.challenges || project.solutions) && (
                  <Card className="border-none shadow-xl card-dark">
                    <CardContent className="p-6">
                      <h2 className="text-2xl font-semibold mb-4 text-white">
                        Challenges & Solutions
                      </h2>

                      {project.challenges && (
                        <div className="mb-6">
                          <h3 className="text-xl font-medium mb-3 text-gray-200">
                            Challenges
                          </h3>
                          <ul className="space-y-2">
                            {project.challenges.map(
                              (challenge: string, idx: number) => (
                                <li key={idx} className="flex items-start">
                                  <div className="w-1.5 h-1.5 rounded-full bg-teal-500 mt-2 mr-2"></div>
                                  <span className="text-gray-300">
                                    {challenge}
                                  </span>
                                </li>
                              )
                            )}
                          </ul>
                        </div>
                      )}

                      {project.solutions && (
                        <div>
                          <h3 className="text-xl font-medium mb-3 text-gray-200">
                            Solutions
                          </h3>
                          <ul className="space-y-2">
                            {project.solutions.map(
                              (solution: string, idx: number) => (
                                <li key={idx} className="flex items-start">
                                  <div className="w-1.5 h-1.5 rounded-full bg-teal-500 mt-2 mr-2"></div>
                                  <span className="text-gray-300">
                                    {solution}
                                  </span>
                                </li>
                              )
                            )}
                          </ul>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              <TabsContent value="gallery">
                <Card className="border-none shadow-xl card-dark">
                  <CardContent className="p-6">
                    <h2 className="text-2xl font-semibold mb-6 text-white">
                      Project Gallery
                    </h2>

                    {project.gallery && project.gallery.length > 0 ? (
                      <ProjectGallery images={project.gallery} />
                    ) : (
                      <div className="text-center py-12 text-gray-400">
                        No gallery images available for this project.
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {project.hasVideo && (
                <TabsContent value="videos">
                  <Card className="border-none shadow-xl card-dark">
                    <CardContent className="p-6">
                      <h2 className="text-2xl font-semibold mb-6 text-white">
                        Project Videos
                      </h2>

                      {project.videos && project.videos.length > 0 ? (
                        <div className="space-y-8">
                          {project.videos.map((video: string, idx: number) => (
                            <ProjectVideo
                              key={idx}
                              videoUrl={video}
                              title={`${project.title} - Demo ${idx + 1}`}
                            />
                          ))}
                        </div>
                      ) : (
                        <div className="text-center py-12 text-gray-400">
                          No videos available for this project.
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>
              )}

              <TabsContent value="features">
                <Card className="border-none shadow-xl card-dark">
                  <CardContent className="p-6">
                    <h2 className="text-2xl font-semibold mb-6 text-white">
                      Key Features
                    </h2>

                    {project.features && project.features.length > 0 ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {project.features.map((feature: any, idx: number) => (
                          <div
                            key={idx}
                            className="flex p-4 bg-gray-900/70 rounded-lg shadow-md border border-gray-800 hover:border-teal-800 transition-colors"
                          >
                            <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gradient-to-br from-teal-600 to-teal-800 flex items-center justify-center mr-4 shadow-md">
                              <div className="w-5 h-5 text-white">
                                {feature.icon || (
                                  <div className="w-2 h-2 bg-white rounded-full"></div>
                                )}
                              </div>
                            </div>
                            <div>
                              <h3 className="text-lg font-medium mb-1 text-gray-200">
                                {feature.title}
                              </h3>
                              <p className="text-gray-300">
                                {feature.description}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-12 text-gray-400">
                        No feature details available for this project.
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>
    </main>
  );
}
