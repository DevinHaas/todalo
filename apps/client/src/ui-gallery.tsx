import { useState, type ReactNode } from "react";
import { Bell, CalendarRange, Inbox, Plus, Settings, Target, Trash2 } from "lucide-react";
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger, Alert, AlertDescription, AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger, AlertTitle, Avatar,
  AvatarFallback, Badge, Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator, Button, Card,
  CardContent, CardDescription, CardHeader, CardTitle, Checkbox, ColorControl, Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
  DropdownMenuShortcut, DropdownMenuTrigger, Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle, Field, FieldDescription, FieldError,
  FieldLabel, Input, Label, Popover, PopoverContent, PopoverDescription, PopoverTitle, PopoverTrigger, PortalLayerContainerProvider, Progress,
  RadioGroup, RadioGroupItem, SegmentedControl, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Separator, Sheet, SheetContent,
  SheetDescription, SheetHeader, SheetTitle, SheetTrigger, SliderControl, Spinner, Switch, SwatchPicker, Table, TableBody, TableCell, TableHead,
  TableHeader, TableRow, Tabs, TabsContent, TabsList, TabsTrigger, Textarea, ToggleGroup, ToggleGroupItem, Tooltip, TooltipContent, TooltipTrigger,
} from "./ui";
import { goalColorKeys, goalColorValue } from "./goals";
import { goalSwatches } from "./goal-views";

/**
 * /ui (o then c): every library component and state, light and dark side by
 * side. Popups portal into their own pane so they take its theme.
 */
export function UiGallery() {
  return <div className="ui grid min-h-svh grid-cols-1 xl:grid-cols-2" data-ui-gallery>
    <Pane title="Light" />
    <Pane title="Dark" dark />
  </div>;
}

function Pane({ title, dark }: { title: string; dark?: boolean }) {
  const [container, setContainer] = useState<HTMLElement | null>(null);
  return <section ref={setContainer} aria-label={`${title} theme`} className={`${dark ? "dark " : ""}relative bg-background p-8 text-foreground`}>
    <PortalLayerContainerProvider container={container}>
      <h1 className="mb-1 text-2xl font-bold">Components · {title}</h1>
      <p className="mb-8 text-muted-foreground">src/ui, themed by src/ui/theme.css. See docs/agents/ui.md.</p>
      <Showcase />
    </PortalLayerContainerProvider>
  </section>;
}

const Group = ({ title, children }: { title: string; children: ReactNode }) => <section className="mb-8">
  <h2 className="mb-3 border-b border-border-subtle pb-1.5 text-sm font-bold">{title}</h2>
  <div className="flex flex-col gap-3">{children}</div>
</section>;
const Row = ({ children }: { children: ReactNode }) => <div className="flex flex-wrap items-center gap-2">{children}</div>;

function Showcase() {
  const [tier, setTier] = useState("primary");
  const [color, setColor] = useState<string>(goalColorKeys[0]!);
  const [hex, setHex] = useState("#dc4c3e");
  const [slider, setSlider] = useState(40);
  const [on, setOn] = useState(true);
  return <>
    <Group title="Button">
      <Row>
        <Button>Add task</Button>
        <Button variant="secondary">Cancel</Button>
        <Button variant="outline">Outline</Button>
        <Button variant="ghost">Ghost</Button>
        <Button variant="destructive"><Trash2 />Delete</Button>
        <Button variant="link">Link</Button>
      </Row>
      <Row>
        <Button size="sm">Small</Button>
        <Button size="lg">Large</Button>
        <Button size="icon" variant="ghost" aria-label="Settings"><Settings /></Button>
        <Button disabled>Disabled</Button>
        <Button variant="outline" disabled>Disabled</Button>
        <Button variant="ghost"><Plus className="text-brand" />Add task</Button>
      </Row>
    </Group>

    <Group title="Text fields">
      <Field><FieldLabel htmlFor="g-title">Title</FieldLabel><Input id="g-title" placeholder="e.g. Ship the beta" /><FieldDescription>Helper text under a field.</FieldDescription></Field>
      <Field><FieldLabel htmlFor="g-filled">Filled</FieldLabel><Input id="g-filled" defaultValue="Finish Todalo" /></Field>
      <Field data-invalid><FieldLabel htmlFor="g-bad">Invalid</FieldLabel><Input id="g-bad" aria-invalid defaultValue="" /><FieldError>A title is required.</FieldError></Field>
      <Field><FieldLabel htmlFor="g-off">Disabled</FieldLabel><Input id="g-off" disabled defaultValue="Read only" /></Field>
      <Field><FieldLabel htmlFor="g-desc">Description</FieldLabel><Textarea id="g-desc" rows={3} placeholder="Why this goal matters" /></Field>
      <Field><FieldLabel>Select</FieldLabel>
        <Select items={[{ value: "primary", label: "Primary" }, { value: "secondary", label: "Secondary" }]} defaultValue="primary">
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="primary">Primary</SelectItem><SelectItem value="secondary">Secondary</SelectItem></SelectContent>
        </Select>
      </Field>
    </Group>

    <Group title="Choices">
      <Row><Label className="flex items-center gap-2"><Checkbox defaultChecked />Checked</Label><Label className="flex items-center gap-2"><Checkbox />Unchecked</Label><Label className="flex items-center gap-2"><Checkbox disabled />Disabled</Label></Row>
      <Row><Label className="flex items-center gap-2"><Switch checked={on} onCheckedChange={setOn} />Milestone</Label><Label className="flex items-center gap-2"><Switch />Off</Label><Label className="flex items-center gap-2"><Switch disabled />Disabled</Label></Row>
      <RadioGroup defaultValue="long" className="flex gap-4">
        {[["long", "12 weeks"], ["short", "4 weeks"], ["custom", "Custom"]].map(([value, label]) => <Label key={value} className="flex items-center gap-2"><RadioGroupItem value={value!} />{label}</Label>)}
      </RadioGroup>
      <Row>
        <ToggleGroup aria-label="Tier" variant="outline" value={[tier]} onValueChange={(next) => next[0] && setTier(next[0])}>
          <ToggleGroupItem value="primary">Primary</ToggleGroupItem><ToggleGroupItem value="secondary">Secondary</ToggleGroupItem>
        </ToggleGroup>
      </Row>
      <div className="max-w-xs"><SegmentedControl name="Layout" options={[{ value: "list", label: "List" }, { value: "board", label: "Board" }, { value: "calendar", label: "Calendar" }]} /></div>
      <div className="max-w-xs"><SliderControl name="Season length" value={slider} min={7} max={84} step={7} unit=" days" onValueChange={setSlider} /></div>
    </Group>

    <Group title="Colour">
      <SwatchPicker aria-label="Colour" swatches={goalSwatches} value={color} onValueChange={setColor} />
      <div className="max-w-xs"><ColorControl name="Free colour" hex={hex} onValueChange={(value) => setHex(value.hex)} /></div>
    </Group>

    <Group title="Badges and status">
      <Row>
        <Badge>Default</Badge><Badge variant="secondary">Secondary</Badge><Badge variant="outline">Outline</Badge>
        <Badge variant="warning">Warning</Badge><Badge variant="destructive">Destructive</Badge>
        <Badge variant="outline"><span className="size-2 rounded-full" style={{ background: goalColorValue("teal") }} />Finish Todalo</Badge>
      </Row>
      <Row><Spinner /><span className="text-muted-foreground">Loading…</span></Row>
      <Progress value={62} aria-label="Day 52 of 84" className="max-w-xs" />
      <Alert><Bell /><AlertTitle>4 primary goals</AlertTitle><AlertDescription>Around 3 keeps your best time protected.</AlertDescription></Alert>
      <Alert variant="destructive"><AlertTitle>Could not save</AlertTitle><AlertDescription>Check your connection and try again.</AlertDescription></Alert>
      <Row><Avatar><AvatarFallback>DH</AvatarFallback></Avatar><Separator orientation="vertical" className="h-6" /><span className="text-muted-foreground">Separator</span></Row>
    </Group>

    <Group title="Overlays">
      <Row>
        <Tooltip><TooltipTrigger render={<Button variant="outline">Tooltip</Button>} /><TooltipContent>Add task <kbd>Q</kbd></TooltipContent></Tooltip>
        <Popover><PopoverTrigger render={<Button variant="outline">Popover</Button>} />
          <PopoverContent><PopoverTitle>Goals</PopoverTitle><PopoverDescription>Link this task to a goal.</PopoverDescription></PopoverContent>
        </Popover>
        <DropdownMenu><DropdownMenuTrigger render={<Button variant="outline">Menu</Button>} />
          <DropdownMenuContent>
            <DropdownMenuLabel>Goal</DropdownMenuLabel>
            <DropdownMenuItem>Edit<DropdownMenuShortcut>E</DropdownMenuShortcut></DropdownMenuItem>
            <DropdownMenuItem>Archive</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive">Delete</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Dialog><DialogTrigger render={<Button variant="outline">Dialog</Button>} />
          <DialogContent>
            <DialogHeader><DialogTitle>Edit goal</DialogTitle><DialogDescription>Title, colour and description.</DialogDescription></DialogHeader>
            <Input defaultValue="Finish Todalo" aria-label="Title" />
            <DialogFooter><Button variant="secondary">Cancel</Button><Button>Save</Button></DialogFooter>
          </DialogContent>
        </Dialog>
        <AlertDialog><AlertDialogTrigger render={<Button variant="outline">Alert dialog</Button>} />
          <AlertDialogContent>
            <AlertDialogHeader><AlertDialogTitle>End this season?</AlertDialogTitle><AlertDialogDescription>Its goals, tiers and targets are kept as history.</AlertDialogDescription></AlertDialogHeader>
            <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction>End season</AlertDialogAction></AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <Sheet><SheetTrigger render={<Button variant="outline">Sheet</Button>} />
          <SheetContent><SheetHeader><SheetTitle>Task</SheetTitle><SheetDescription>A side panel.</SheetDescription></SheetHeader></SheetContent>
        </Sheet>
      </Row>
    </Group>

    <Group title="Disclosure and navigation">
      <Accordion defaultValue={["criteria"]}>
        <AccordionItem value="criteria"><AccordionTrigger>Done criteria</AccordionTrigger><AccordionContent>What must be true to reach this milestone.</AccordionContent></AccordionItem>
        <AccordionItem value="notes"><AccordionTrigger>Notes</AccordionTrigger><AccordionContent>Collapsed by default.</AccordionContent></AccordionItem>
      </Accordion>
      <Tabs defaultValue="current"><TabsList><TabsTrigger value="current">Current</TabsTrigger><TabsTrigger value="past">Past</TabsTrigger></TabsList>
        <TabsContent value="current" className="pt-2 text-muted-foreground">Current season</TabsContent><TabsContent value="past" className="pt-2 text-muted-foreground">Past seasons</TabsContent>
      </Tabs>
      <Breadcrumb><BreadcrumbList><BreadcrumbItem><BreadcrumbLink href="#">Goals</BreadcrumbLink></BreadcrumbItem><BreadcrumbSeparator /><BreadcrumbItem><BreadcrumbPage>Finish Todalo</BreadcrumbPage></BreadcrumbItem></BreadcrumbList></Breadcrumb>
      <nav aria-label="Sidebar sample" className="w-64 rounded-xl bg-sidebar p-2">
        <SidebarItem icon={<Inbox />} label="Inbox" count={4} />
        <SidebarItem icon={<CalendarRange />} label="Current season" count="Day 52 of 84" active />
        <SidebarItem icon={<Target />} label="Finish Todalo" />
      </nav>
    </Group>

    <Group title="Surfaces">
      <Card><CardHeader><CardTitle>This season · Primary</CardTitle><CardDescription>Target: A testable version for others</CardDescription></CardHeader><CardContent className="text-muted-foreground">Card body.</CardContent></Card>
      <Empty className="border border-dashed border-border"><EmptyHeader><EmptyMedia variant="icon"><Target /></EmptyMedia><EmptyTitle>No milestones</EmptyTitle><EmptyDescription>Turn on Milestone in a linked task's details.</EmptyDescription></EmptyHeader></Empty>
      <Table><TableHeader><TableRow><TableHead>Goal</TableHead><TableHead>Tier</TableHead></TableRow></TableHeader>
        <TableBody><TableRow><TableCell>Finish Todalo</TableCell><TableCell>Primary</TableCell></TableRow><TableRow><TableCell>Run a half</TableCell><TableCell>Secondary</TableCell></TableRow></TableBody>
      </Table>
    </Group>
  </>;
}

/** The sidebar row recipe the migrated sidebar sections use (see goal-views SidebarLink). */
function SidebarItem({ icon, label, count, active }: { icon: ReactNode; label: string; count?: ReactNode; active?: boolean }) {
  return <a href="#" data-active={active || undefined} className="flex h-sidebar-item items-center gap-2 rounded-lg px-2 text-sm text-sidebar-foreground hover:bg-sidebar-accent data-active:bg-brand-tint data-active:text-brand-tint-foreground [&_svg]:size-4 [&_svg]:text-subtle-foreground data-active:[&_svg]:text-brand-tint-foreground">
    {icon}<span className="min-w-0 flex-1 truncate">{label}</span>{count !== undefined && <span className="text-xs text-subtle-foreground">{count}</span>}
  </a>;
}
